import { loadManifold, manifoldToGeometry } from './remesh.js';

// Add a stability base/plinth beneath a posed, watertight figure and fuse it in.
//
// The remesh already returns a watertight `manifold`, and a plinth is itself a
// closed solid, so we fuse with an EXACT manifold boolean union -- no second SDF
// pass (PLAN.md section 6.5, Phase 2A). The figure is first scaled to the target
// figurine height (manifold space), then the base is seated just under the feet,
// centred on the figure's vertex centroid in XZ so the weight sits over the
// footprint (important for waving / attacking / casting poses).
//
//   manifold       : a watertight Manifold (e.g. from remeshToWatertight).
//   targetHeightMm : figure height to scale to; the base adds a little below this.
//   shape          : 'round' (default) or 'hex'.
//   diameterFactor : base diameter = figure footprint * this (default 1.25).
//   baseHeightMm   : base thickness; default max(1.5, targetHeight * 0.05).
//
// Returns { manifold, geometry } where geometry is a THREE.BufferGeometry.
export async function withBase(manifold, {
  targetHeightMm,
  shape = 'round',
  diameterFactor = 1.25,
  baseHeightMm,
} = {}) {
  const { Manifold } = await loadManifold();

  // 1. Scale the figure to the requested height (uniform).
  let figure = manifold;
  if (targetHeightMm) {
    const bb = figure.boundingBox();
    const height = bb.max[1] - bb.min[1];
    if (!(height > 0)) throw new Error('withBase: figure has zero height');
    const s = targetHeightMm / height;
    figure = figure.scale([s, s, s]);
  }

  // 2. Measure the scaled figure: footprint extent + min-Y + XZ centroid (CoM proxy).
  const bb = figure.boundingBox();
  const sizeX = bb.max[0] - bb.min[0];
  const sizeZ = bb.max[2] - bb.min[2];
  const minY = bb.min[1];
  const footHeight = bb.max[1] - bb.min[1];

  const mesh = figure.getMesh();
  const stride = mesh.numProp;
  const n = mesh.numVert;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += mesh.vertProperties[i * stride];
    cz += mesh.vertProperties[i * stride + 2];
  }
  cx /= n;
  cz /= n;

  // 3. Size the base.
  const radius = 0.5 * Math.max(sizeX, sizeZ) * diameterFactor;
  const height = baseHeightMm ?? Math.max(1.5, footHeight * 0.05);
  const overlap = Math.max(0.3, height * 0.2); // intersect the feet for a robust union
  const segments = shape === 'hex' ? 6 : 64;

  // 4. Build the base: a cylinder is created along Z, so rotate it to stand on Y,
  //    then seat its top just above the figure's feet, centred on the centroid.
  const base = Manifold.cylinder(height, radius, radius, segments, false)
    .rotate([-90, 0, 0]) // Z-axis cylinder -> Y-up
    .translate([cx, minY + overlap - height, cz]);

  const fused = figure.add(base);
  return { manifold: fused, geometry: manifoldToGeometry(fused) };
}
