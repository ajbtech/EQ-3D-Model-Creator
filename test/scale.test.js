import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { scaleGeometryToHeight } from '../phase0/pipeline/scale.js';

test('scaleGeometryToHeight scales the chosen axis to the target and reports the factor', () => {
  // A 2u-tall box -> target 32mm should scale by 16x.
  const g = new THREE.BoxGeometry(2, 2, 2);
  const { geometry, factor } = scaleGeometryToHeight(g, 32, 'y');

  assert.ok(Math.abs(factor - 16) < 1e-9, 'factor = target / current height');
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  assert.ok(Math.abs(size.y - 32) < 1e-4, 'height becomes 32mm');
  assert.ok(Math.abs(size.x - 32) < 1e-4, 'uniform scale preserves proportions (x)');
  assert.ok(Math.abs(size.z - 32) < 1e-4, 'uniform scale preserves proportions (z)');
});

test('scaleGeometryToHeight does not mutate the input geometry', () => {
  const g = new THREE.BoxGeometry(2, 4, 2);
  scaleGeometryToHeight(g, 40, 'y');
  g.computeBoundingBox();
  const size = new THREE.Vector3();
  g.boundingBox.getSize(size);
  assert.ok(Math.abs(size.y - 4) < 1e-9, 'original geometry is unchanged');
});

test('scaleGeometryToHeight throws on a degenerate (zero-height) axis', () => {
  const flat = new THREE.PlaneGeometry(2, 2); // lies in z=0 plane -> zero depth
  assert.throws(() => scaleGeometryToHeight(flat, 32, 'z'), /height/i);
});
