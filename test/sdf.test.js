import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeSignedDistance } from '../phase0/pipeline/sdf.js';
import { mergeGeometries } from '../phase0/pipeline/merge.js';

// Axis-aligned box of the given edge length, optionally translated.
function box(size, [tx, ty, tz] = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(size, size, size);
  g.translate(tx, ty, tz);
  return g;
}

test('signed distance: sign and magnitude on a single closed box', () => {
  const sdf = makeSignedDistance(box(2)); // spans -1..1
  assert.ok(sdf([0, 0, 0]) > 0, 'centre reads inside (positive)');
  assert.ok(sdf([5, 0, 0]) < 0, 'far point reads outside (negative)');
  assert.ok(Math.abs(Math.abs(sdf([5, 0, 0])) - 4) < 1e-3, 'distance ~4 to the face at x=1');
});

// Regression guard for the winding-vs-parity bug. A real EQ model is many
// interpenetrating closed parts; plain crossing-parity computes their symmetric
// difference, so a point inside two overlapping parts reads "outside" and carves
// spurious tunnels. The winding sum must read it as inside (the UNION).
test('signed distance: overlap of two parts reads INSIDE (union, not parity)', () => {
  const a = box(2, [0, 0, 0]); // -1..1
  const b = box(2, [1, 0, 0]); // 0..2  -> overlap is x in [0,1]
  const sdf = makeSignedDistance(mergeGeometries([a, b]));
  assert.ok(sdf([0.5, 0, 0]) > 0, 'overlap region is inside (parity would wrongly say outside)');
  assert.ok(sdf([1.5, 0, 0]) > 0, 'inside B only is inside');
  assert.ok(sdf([-0.5, 0, 0]) > 0, 'inside A only is inside');
  assert.ok(sdf([3, 0, 0]) < 0, 'outside both is outside');
});
