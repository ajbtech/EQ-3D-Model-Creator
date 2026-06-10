import * as THREE from 'three';

// Build a synthetic, fully in-memory "character": a skinned box body with a
// 2-segment spine, a hand bone, and a thin blade attached to that hand bone.
//
// Why synthetic? Phase 0 must prove the print-prep *spine* (pose -> bake -> SDF
// remesh -> watertight STL) without redistributing any EverQuest art (PLAN.md
// section 0.1 / section 9). This rig is deliberately shaped to stress the same
// hard cases a real extracted EQ glTF will: a skinned body that deforms when
// posed, plus a very thin, separate weapon that must survive the remesh and fuse
// to the body (PLAN.md section 11 risks). It is NOT EQ art -- just a test jig.
//
// Returns { root, animations } shaped like a loaded gltf (gltf.scene, gltf.animations),
// so the exact same pipeline runs here and, later, on a user-supplied glTF.
export function makeSyntheticRig() {
  // --- Body geometry: a tall box spanning y = -5..5, segmented along height so
  //     skinning bends smoothly. ---
  const H = 10;
  const geometry = new THREE.BoxGeometry(3, H, 2, 1, 24, 1);

  // --- Skeleton: root at the base, spine in the middle, hand at the top. ---
  const boneRoot = new THREE.Bone();
  boneRoot.name = 'root';
  boneRoot.position.set(0, -H / 2, 0); // base of the body

  const boneSpine = new THREE.Bone();
  boneSpine.name = 'spine';
  boneSpine.position.set(0, H / 2, 0); // +5 from root -> world y = 0 (mid body)
  boneRoot.add(boneSpine);

  const boneHand = new THREE.Bone();
  boneHand.name = 'hand';
  boneHand.position.set(0, H / 2, 0); // +5 from spine -> world y = 5 (top)
  boneSpine.add(boneHand);

  const skeleton = new THREE.Skeleton([boneRoot, boneSpine, boneHand]);

  // --- Skin weights: lower half -> root bone, upper half -> spine bone, with a
  //     short linear blend across the middle so the bend is smooth. ---
  const pos = geometry.getAttribute('position');
  const skinIndices = [];
  const skinWeights = [];
  const band = 2.0; // blend band half-width around y = 0
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // t = 0 fully root bone (index 0), t = 1 fully spine bone (index 1)
    let t = (y + band) / (2 * band);
    t = Math.min(1, Math.max(0, t));
    skinIndices.push(0, 1, 0, 0);
    skinWeights.push(1 - t, t, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'body';
  mesh.add(boneRoot);
  mesh.bind(skeleton);

  // --- Equipment: a very thin "blade" attached to the hand bone, like a held
  //     weapon. 0.05 units thick deliberately tests thin-feature survival and
  //     part fusion in the remesh (PLAN.md Phase 0 weapon de-risk). ---
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 8, 0.05),
    new THREE.MeshStandardMaterial(),
  );
  blade.name = 'weapon';
  blade.position.set(0, 4, 0.6); // rises above the hand, offset so it overlaps the body grip
  boneHand.add(blade);

  // --- Animation: rotate the spine bone from upright (t=0) to a 50-degree bend
  //     (t=1), giving us distinct "standing" vs "waving" poses to bake. ---
  const qStart = new THREE.Quaternion();
  const qEnd = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * 0.28);
  const spineTrack = new THREE.QuaternionKeyframeTrack(
    'spine.quaternion',
    [0, 1],
    [...qStart.toArray(), ...qEnd.toArray()],
  );
  const clip = new THREE.AnimationClip('Pose', 1, [spineTrack]);

  return { root: mesh, animations: [clip] };
}
