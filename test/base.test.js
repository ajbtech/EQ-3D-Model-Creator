import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadManifold } from '../phase0/pipeline/remesh.js';
import { withBase } from '../phase0/pipeline/base.js';

function bbox(geometry) {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  return { box: geometry.boundingBox, size };
}

test('withBase scales the figure to the target height and seats a base beneath it', async () => {
  const { Manifold } = await loadManifold();
  const figure = Manifold.cube([6, 10, 6], true); // 10 tall, centred -> minY -5

  const { manifold, geometry } = await withBase(figure, { targetHeightMm: 32, shape: 'round' });

  assert.equal(manifold.genus(), 0, 'fused result is genus 0');
  assert.equal(manifold.decompose().length, 1, 'figure + base fuse into one component');
  assert.ok(manifold.volume() > 0, 'positive volume');

  const { box, size } = bbox(geometry);
  // Figure scaled to 32mm; base adds a few mm below -> total slightly taller than 32.
  assert.ok(size.y > 32 && size.y < 32 + 6, `total height ${size.y.toFixed(2)} = figure + small base`);
  assert.ok(box.min.y < -16 + 1e-6, 'base extends below the scaled figure feet (~-16)');
});

test('withBase widens the footprint so the figure can stand', async () => {
  const { Manifold } = await loadManifold();
  const figure = Manifold.cube([6, 10, 6], true);
  const { geometry } = await withBase(figure, { targetHeightMm: 32, diameterFactor: 1.4 });

  // Scaled figure footprint is 6 * (32/10) = 19.2mm; base should be wider.
  const { size } = bbox(geometry);
  assert.ok(size.x > 19.2, `base footprint ${size.x.toFixed(2)}mm exceeds the figure's ~19.2mm`);
});

test('withBase supports a hex base and stays watertight', async () => {
  const { Manifold } = await loadManifold();
  const figure = Manifold.cube([6, 10, 6], true);
  const { manifold } = await withBase(figure, { targetHeightMm: 30, shape: 'hex' });
  assert.equal(manifold.decompose().length, 1, 'single component');
  assert.ok(manifold.volume() > 0 && Number.isFinite(manifold.genus()), 'watertight hex base');
});
