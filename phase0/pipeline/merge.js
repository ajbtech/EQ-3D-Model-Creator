import * as THREE from 'three';

// Concatenate several geometries' triangles into one position-only indexed
// BufferGeometry. Tolerates a mix of indexed and non-indexed inputs (skinned
// meshes bake to non-indexed, static props stay indexed) -- which is exactly the
// case three-mesh-bvh's StaticGeometryGenerator refuses to merge. We only need
// positions here because the downstream step is an SDF remesh that rebuilds
// topology and normals from scratch.
export function mergeGeometries(geometries) {
  const positions = [];
  const indices = [];
  let base = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + base);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(base + i);
    }
    base += pos.count;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  return geom;
}
