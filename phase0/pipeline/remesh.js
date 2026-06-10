import * as THREE from 'three';
import ManifoldModule from 'manifold-3d';
import { makeSignedDistance } from './sdf.js';
import { mergeGeometries } from './merge.js';

let _wasmPromise = null;

// Load and initialise the manifold-3d WASM module once, reusing it thereafter.
export function loadManifold() {
  if (!_wasmPromise) {
    _wasmPromise = ManifoldModule().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return _wasmPromise;
}

// Convert a manifold-3d Manifold into a THREE.BufferGeometry.
function manifoldToGeometry(manifold) {
  const mesh = manifold.getMesh();
  const geom = new THREE.BufferGeometry();
  // numProp is 3 for pure-position level sets.
  const stride = mesh.numProp;
  let positions;
  if (stride === 3) {
    positions = mesh.vertProperties;
  } else {
    positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) {
      positions[i * 3] = mesh.vertProperties[i * stride];
      positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1];
      positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2];
    }
  }
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return geom;
}

// Turn one or more (possibly open / intersecting) THREE geometries into a single
// watertight, manifold solid via SDF sampling + manifold-3d levelSet -- the
// volumetric "shrink-wrap" remesh of PLAN.md section 6.3/6.4. All parts are fused
// automatically and the result is guaranteed 2-manifold and closed.
//
// Options:
//   voxelSize : edge length of the sampling grid. Smaller = more detail, slower.
//               Defaults to ~1/128 of the longest bounding-box axis.
//   dilate    : grow the solid outward by this distance before extraction. Closes
//               thin gaps and enforces a minimum wall thickness on blades/capes
//               (PLAN.md section 6.5). Surface is extracted at level = -dilate.
//               If left undefined it defaults to ~1 voxel, which fuses the many
//               separate sub-meshes of a real EQ model into one solid; pass 0
//               explicitly to disable.
//   margin    : padding added around the bounding box so the dilated surface fits.
export async function remeshToWatertight(geometries, { voxelSize, dilate, margin } = {}) {
  const wasm = await loadManifold();
  const { Manifold } = wasm;

  const geos = Array.isArray(geometries) ? geometries : [geometries];
  const merged = mergeGeometries(geos);
  const bb = merged.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);

  if (!voxelSize) {
    voxelSize = Math.max(size.x, size.y, size.z) / 128;
  }
  // Default to ~1.5 voxels of dilation so a real model's many separate body parts
  // fuse into a single connected watertight solid (the smallest that reliably gives
  // one component on extracted EQ models). Any remaining genus is anatomical -- the
  // arm-to-torso and leg gaps -- which we keep so the figure isn't a blob. Pass an
  // explicit 0 to disable, or a larger value to merge limbs further.
  if (dilate === undefined) dilate = voxelSize * 1.5;
  const pad = margin ?? dilate + voxelSize * 3;
  const bounds = {
    min: [bb.min.x - pad, bb.min.y - pad, bb.min.z - pad],
    max: [bb.max.x + pad, bb.max.y + pad, bb.max.z + pad],
  };

  const sdf = makeSignedDistance(merged);

  // levelSet keeps the region where f > level. f is positive inside, so level=0
  // extracts the original surface; level=-dilate grows the solid outward by `dilate`.
  let manifold = Manifold.levelSet((p) => sdf(p), bounds, voxelSize, -dilate);

  // Morphological CLOSE: if we dilated to bridge the gaps between the model's
  // separate parts, erode by the same amount so the body returns to its true
  // thickness. Bridges narrower than 2*dilate survive (thin, natural-looking
  // joins) while the rest of the surface is no longer bulked out. The second SDF
  // is built from the dilated solid -- already watertight -- so its sign is exact.
  if (dilate > 0 && !manifold.isEmpty()) {
    const dilatedGeo = manifoldToGeometry(manifold);
    // The dilated solid is watertight, so a single-ray winding is exact -- no need
    // for the 5-direction vote, cutting this pass's raycasts 5x without quality loss.
    const sdf2 = makeSignedDistance(dilatedGeo, { directions: 1 });
    const eroded = Manifold.levelSet((p) => sdf2(p), bounds, voxelSize, dilate);
    if (!eroded.isEmpty() && eroded.volume() > 0) manifold = eroded;
  }

  const geometry = manifoldToGeometry(manifold);
  const stats = {
    volume: manifold.volume(),
    surfaceArea: manifold.surfaceArea(),
    genus: manifold.genus(),
    triangles: manifold.numTri(),
    vertices: manifold.numVert(),
    // manifold-3d guarantees a 2-manifold closed surface by construction; a
    // non-empty positive-volume result is therefore watertight.
    watertight: !manifold.isEmpty() && manifold.volume() > 0,
    voxelSize,
    dilate,
  };
  return { geometry, manifold, stats };
}
