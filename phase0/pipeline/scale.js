import * as THREE from 'three';

// Uniformly scale a geometry so its size along `axis` equals `targetMm`.
//
// EQ units are arbitrary and rips routinely "need scaling" (PLAN.md section 6.5):
// we normalise to a target figurine height per race so the exported STL prints at a
// sane real-world size. Returns a scaled CLONE plus the factor applied; the input
// geometry is left untouched.
export function scaleGeometryToHeight(geometry, targetMm, axis = 'y') {
  const source = geometry.clone();
  source.computeBoundingBox();
  const size = new THREE.Vector3();
  source.boundingBox.getSize(size);

  const current = size[axis];
  if (!Number.isFinite(current) || current <= 0) {
    throw new Error(`scaleGeometryToHeight: geometry has zero/invalid height on axis "${axis}"`);
  }

  const factor = targetMm / current;
  source.scale(factor, factor, factor);
  source.computeBoundingBox();
  return { geometry: source, factor };
}
