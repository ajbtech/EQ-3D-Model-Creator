import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { geometryToStl, stlToBuffer } from '../phase0/pipeline/exportStl.js';

// Parse a binary STL and check every edge is shared by exactly two triangles --
// i.e. the surface is closed/manifold. This is the same independent check the
// spike uses, applied here as a unit test on the exporter.
function edgeCheck(buf) {
  const n = buf.readUInt32LE(80);
  const edges = new Map();
  const vkey = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const ekey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  let off = 84;
  for (let i = 0; i < n; i++) {
    off += 12; // skip normal
    const v = [];
    for (let j = 0; j < 3; j++) {
      v.push(vkey(buf.readFloatLE(off), buf.readFloatLE(off + 4), buf.readFloatLE(off + 8)));
      off += 12;
    }
    off += 2; // attribute byte count
    for (let j = 0; j < 3; j++) {
      const k = ekey(v[j], v[(j + 1) % 3]);
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const c of edges.values()) {
    if (c < 2) open++;
    else if (c > 2) nonManifold++;
  }
  return { triangles: n, open, nonManifold };
}

test('binary STL: triangle count matches geometry and surface is closed', () => {
  const stl = geometryToStl(new THREE.BoxGeometry(2, 2, 2), { binary: true });
  const buf = stlToBuffer(stl);
  const { triangles, open, nonManifold } = edgeCheck(buf);
  assert.equal(triangles, 12, 'a box exports 12 triangles');
  assert.equal(open, 0, 'no open edges');
  assert.equal(nonManifold, 0, 'no non-manifold edges');
});

test('ascii STL export returns a string', () => {
  const stl = geometryToStl(new THREE.BoxGeometry(1, 1, 1), { binary: false });
  assert.equal(typeof stl, 'string');
  assert.match(stl, /facet normal/);
});
