import { bakePose } from './pose.js';
import { remeshToWatertight } from './remesh.js';

export { bakePose } from './pose.js';
export { remeshToWatertight, loadManifold } from './remesh.js';
export { makeSignedDistance } from './sdf.js';
export { geometryToStl, stlToBuffer } from './exportStl.js';

// End-to-end Phase 0 spine: pose -> bake -> watertight remesh.
//
//   root        : Object3D containing the (skinned) body + bone-attached equipment.
//   animations  : array of THREE.AnimationClip.
//   clipName    : which clip to pose with (defaults to first).
//   time        : time within the clip, in seconds.
//   voxelSize   : remesh grid resolution (see remeshToWatertight).
//   dilate      : thickening distance (see remeshToWatertight).
//
// Returns { posedGeometry, geometry, manifold, stats }.
export async function runPipeline({ root, animations, clipName, time = 0, voxelSize, dilate } = {}) {
  const { geometry: posedGeometry, clip, meshCount } = bakePose(root, animations, { clipName, time });
  const result = await remeshToWatertight(posedGeometry, { voxelSize, dilate });
  return { posedGeometry, clip, meshCount, ...result };
}
