import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from '../phase0/pipeline/merge.js';

// A BoxGeometry is indexed: 24 position vertices, 36 indices (12 triangles).
test('mergeGeometries concatenates indexed + non-indexed inputs', () => {
  const indexed = new THREE.BoxGeometry(1, 1, 1); // 24 verts, 12 tris, indexed
  const nonIndexed = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); // 36 verts, no index

  const merged = mergeGeometries([indexed, nonIndexed]);

  assert.ok(merged.index, 'merged result is indexed');
  assert.equal(merged.index.count / 3, 24, 'triangle counts add (12 + 12)');
  assert.equal(merged.getAttribute('position').count, 24 + 36, 'vertex counts add');
  assert.ok(merged.boundingBox, 'bounding box is computed');
});

test('mergeGeometries keeps every triangle index in range', () => {
  const merged = mergeGeometries([
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.BoxGeometry(1, 1, 1).translate(5, 0, 0),
  ]);
  const vCount = merged.getAttribute('position').count;
  const idx = merged.index.array;
  let max = -1;
  for (let i = 0; i < idx.length; i++) max = Math.max(max, idx[i]);
  assert.ok(max < vCount, 'no index points past the vertex array (offsets applied correctly)');
});
