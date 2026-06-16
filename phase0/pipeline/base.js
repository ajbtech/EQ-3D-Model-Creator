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
  let figure = manifold;
  let factor = 1;
  if (targetHeightMm) {
    ({ manifold: figure, factor } = await scaleManifoldToHeight(manifold, targetHeightMm));
  }

  const base = await baseManifoldFor(figure, { shape, diameterFactor, baseHeightMm });
  const fused = figure.add(base);
  return { manifold: fused, geometry: manifoldToGeometry(fused), factor };
}

// Uniformly scale a watertight Manifold so its Y-extent equals targetHeightMm.
// Returns { manifold, factor } so the same factor can be applied to sibling parts
// (equipment) for multi-part export, keeping everything aligned for assembly.
export async function scaleManifoldToHeight(manifold, targetHeightMm) {
  const bb = manifold.boundingBox();
  const height = bb.max[1] - bb.min[1];
  if (!(height > 0)) throw new Error('scaleManifoldToHeight: figure has zero height');
  const factor = targetHeightMm / height;
  return { manifold: manifold.scale([factor, factor, factor]), factor };
}

// Build a stability base/plinth seated just under the feet of an (already-scaled)
// figure manifold, centred on its vertex centroid in XZ. Returns the base Manifold
// alone (not fused), so callers can either union it in (single STL, see withBase) or
// export it as its own part (multi-part export).
export async function baseManifoldFor(figure, {
  shape = 'round',
  diameterFactor = 1.25,
  baseHeightMm,
} = {}) {
  const { Manifold } = await loadManifold();

  // Measure the figure: footprint extent + min-Y + XZ centroid (CoM proxy).
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

  const radius = 0.5 * Math.max(sizeX, sizeZ) * diameterFactor;
  const height = baseHeightMm ?? Math.max(1.5, footHeight * 0.05);
  const overlap = Math.max(0.3, height * 0.2); // intersect the feet for a robust union
  const segments = shape === 'hex' ? 6 : 64;

  // A cylinder is created along Z, so rotate it to stand on Y, then seat its top just
  // above the figure's feet, centred on the centroid.
  return Manifold.cylinder(height, radius, radius, segments, false)
    .rotate([-90, 0, 0]) // Z-axis cylinder -> Y-up
    .translate([cx, minY + overlap - height, cz]);
}
