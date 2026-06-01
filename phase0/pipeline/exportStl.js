import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

// Serialise a geometry to STL. Returns a DataView (binary) or string (ascii),
// matching three's STLExporter. This is the final PLAN.md section 6.5 export step.
export function geometryToStl(geometry, { binary = true } = {}) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const exporter = new STLExporter();
  return exporter.parse(mesh, { binary });
}

// Convenience for Node: get a Buffer ready to write to disk.
export function stlToBuffer(stl) {
  if (typeof stl === 'string') return Buffer.from(stl, 'utf8');
  // DataView -> Buffer over its underlying ArrayBuffer slice.
  return Buffer.from(stl.buffer, stl.byteOffset ?? 0, stl.byteLength);
}
