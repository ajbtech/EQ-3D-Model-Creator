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
