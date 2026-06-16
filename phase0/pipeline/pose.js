import * as THREE from 'three';
import { StaticGeometryGenerator } from 'three-mesh-bvh';
import { mergeGeometries } from './merge.js';

// Collect every renderable mesh (skinned or not) under a root object.
export function collectMeshes(root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) meshes.push(o);
  });
  return meshes;
}

// Walk up from a mesh to the nearest equipment-attachment holder (the Object3D that
// attach.js tags with userData.isEquipmentAttachment). Returns the holder or null.
function attachmentHolderOf(mesh) {
  let o = mesh;
  while (o) {
    if (o.userData && o.userData.isEquipmentAttachment) return o;
    o = o.parent;
  }
  return null;
}

// Bake a list of meshes (already posed -- caller must have evaluated the skeleton and
// called updateMatrixWorld) into a single static, world-space BufferGeometry.
function bakeMeshList(meshes) {
  const geometries = meshes.map((mesh) => {
    const generator = new StaticGeometryGenerator([mesh]);
    generator.attributes = ['position', 'normal'];
    return generator.generate();
  });
  return mergeGeometries(geometries);
}

// Evaluate the skeleton at `time` and play/clamp the chosen clip, returning the clip
// name actually used (or null). Shared by bakePose and bakePoseGrouped.
function applyPose(root, animations, { clipName, time = 0 }) {
  let usedClip = null;
  if (animations && animations.length) {
    const clip = clipName
      ? THREE.AnimationClip.findByName(animations, clipName)
      : animations[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip);
      // Freeze at a single frame: LoopOnce + clamp so evaluating at (or past) the
      // clip's end holds the final frame instead of wrapping back to frame 0.
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(time); // evaluates the skeleton at `time`
      usedClip = clip.name;
    }
  }
  // Make sure every world matrix reflects the posed skeleton before we bake.
  root.updateMatrixWorld(true);
  return usedClip;
}

// Evaluate an animation clip at `time` (seconds) and bake the whole hierarchy --
// skinned body deformation plus any bone-attached equipment -- into a single
// static, world-space BufferGeometry. This is the "freeze the figure at a frame"
// step from PLAN.md section 5: load the clip, evaluate the skeleton, bake the
// linear-blend skinning into a static deformed mesh.
//
// `root`        : an Object3D (e.g. a loaded gltf.scene) containing the meshes.
// `animations`  : array of THREE.AnimationClip (e.g. gltf.animations). May be empty.
// `clipName`    : name of the clip to use; defaults to the first clip.
// `time`        : time within the clip to freeze at, in seconds.
export function bakePose(root, animations = [], { clipName, time = 0 } = {}) {
  const usedClip = applyPose(root, animations, { clipName, time });

  const meshes = collectMeshes(root);
  if (meshes.length === 0) {
    throw new Error('bakePose: no meshes found under root');
  }

  // Bake each mesh individually -- a skinned body bakes to non-indexed geometry
  // while a static prop stays indexed, and StaticGeometryGenerator won't merge
  // those together. We merge them ourselves (positions only) afterwards.
  const geometries = meshes.map((mesh) => {
    const generator = new StaticGeometryGenerator([mesh]);
    generator.attributes = ['position', 'normal'];
    return generator.generate();
  });

  const geometry = mergeGeometries(geometries);

  return { geometry, geometries, clip: usedClip, meshCount: meshes.length };
}

// Like bakePose, but splits the figure into separate parts for multi-part export
// (PLAN.md Phase 4): the body (everything skinned to the base skeleton) and one part
// per attached equipment holder, so each can be remeshed/printed separately (e.g. to
// paint a weapon in a different colour). All parts are baked in the SAME posed world
// space, so scaling them by one shared factor keeps them aligned for assembly.
//
// Returns { body, parts, clip } where:
//   body  : merged BufferGeometry of all non-equipment meshes (null if none).
//   parts : [{ slot, geometry, meshCount }] one per equipment holder, keyed by the
//           holder's userData.equipmentSlot (falling back to 'equipment').
export function bakePoseGrouped(root, animations = [], { clipName, time = 0 } = {}) {
  const usedClip = applyPose(root, animations, { clipName, time });

  const meshes = collectMeshes(root);
  if (meshes.length === 0) {
    throw new Error('bakePoseGrouped: no meshes found under root');
  }

  const bodyMeshes = [];
  const holders = new Map(); // holder Object3D -> meshes[]
  for (const mesh of meshes) {
    const holder = attachmentHolderOf(mesh);
    if (holder) {
      if (!holders.has(holder)) holders.set(holder, []);
      holders.get(holder).push(mesh);
    } else {
      bodyMeshes.push(mesh);
    }
  }

  // Bake equipment groups first, while everything is still parented (world matrices
  // are correct). Each holder subtree contains only its own meshes.
  const parts = [];
  for (const [holder, group] of holders) {
    const slot = holder.userData?.equipmentSlot || 'equipment';
    parts.push({ slot, geometry: bakeMeshList(group), meshCount: group.length });
  }

  // Bake the body. StaticGeometryGenerator traverses descendants, and the body
  // SkinnedMesh carries the whole skeleton (with the equipment holder beneath a bone)
  // as children -- so we temporarily detach the holders to keep equipment out of the
  // body geometry, then restore them. Detaching doesn't touch the body's own matrices.
  const detached = [];
  for (const holder of holders.keys()) {
    if (holder.parent) {
      detached.push([holder, holder.parent]);
      holder.parent.remove(holder);
    }
  }
  const body = bodyMeshes.length ? bakeMeshList(bodyMeshes) : null;
  for (const [holder, parent] of detached) parent.add(holder);

  return { body, parts, clip: usedClip };
}
