import { bakePose, bakePoseGrouped } from './pose.js';
import { remeshToWatertight, manifoldToGeometry } from './remesh.js';
import { scaleManifoldToHeight, baseManifoldFor } from './base.js';

export { bakePose, bakePoseGrouped } from './pose.js';
export { remeshToWatertight, manifoldToGeometry, loadManifold } from './remesh.js';
export { makeSignedDistance } from './sdf.js';
export { geometryToStl, stlToBuffer } from './exportStl.js';
export { scaleGeometryToHeight } from './scale.js';
export { resolvePose } from './poses.js';
export { withBase, scaleManifoldToHeight, baseManifoldFor } from './base.js';
export { resolveBone, attachEquipment, detachEquipment, listBones } from './attach.js';

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

// Multi-part variant of runPipeline (PLAN.md Phase 4): instead of fusing the body,
// equipment and base into one solid, it remeshes each into its own watertight part so
// they can be printed separately (e.g. weapon in a different filament colour) and
// glued/assembled afterwards. Every part is scaled by the SAME factor (derived from
// the body) so the pieces stay registered.
//
//   targetHeightMm : figurine height; the body is scaled to this, the rest follow.
//   base           : truthy to emit a separate base part; pass base options
//                    ({ shape, diameterFactor, baseHeightMm }) to tune it.
//
// Returns { parts, clip, factor } where parts is
//   [{ name, manifold, geometry }] -- 'body' first, then 'base' (if requested), then
//   one entry per equipment slot.
export async function runMultiPartPipeline({
  root, animations, clipName, time = 0, voxelSize, dilate,
  targetHeightMm, base,
} = {}) {
  const { body, parts: equipmentParts, clip } = bakePoseGrouped(root, animations, { clipName, time });
  if (!body) throw new Error('runMultiPartPipeline: no body geometry to remesh');

  // Body: remesh, then scale to the requested height. The factor is reused below.
  const bodyRemesh = await remeshToWatertight(body, { voxelSize, dilate });
  let bodyManifold = bodyRemesh.manifold;
  let factor = 1;
  if (targetHeightMm) {
    ({ manifold: bodyManifold, factor } = await scaleManifoldToHeight(bodyManifold, targetHeightMm));
  }

  const out = [{ name: 'body', manifold: bodyManifold, geometry: manifoldToGeometry(bodyManifold) }];

  if (base) {
    const baseOpts = typeof base === 'object' ? base : {};
    const baseManifold = await baseManifoldFor(bodyManifold, baseOpts);
    out.push({ name: 'base', manifold: baseManifold, geometry: manifoldToGeometry(baseManifold) });
  }

  // Equipment: remesh each holder on its own, then apply the SAME scale factor so the
  // piece lines up with the scaled body for assembly.
  for (const part of equipmentParts) {
    const pr = await remeshToWatertight(part.geometry, { voxelSize, dilate });
    const scaled = factor === 1 ? pr.manifold : pr.manifold.scale([factor, factor, factor]);
    out.push({ name: part.slot, manifold: scaled, geometry: manifoldToGeometry(scaled) });
  }

  return { parts: out, clip, factor };
}
