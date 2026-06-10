import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { remeshToWatertight } from '../phase0/pipeline/remesh.js';
import { runPipeline } from '../phase0/pipeline/index.js';
import { makeSyntheticRig } from '../phase0/fixtures/makeSyntheticRig.js';

function box(size, [tx, ty, tz] = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(size, size, size);
  g.translate(tx, ty, tz);
  return g;
}

// Coarse resolution keeps these fast; we assert topology, not fine detail.

test('remesh fuses two separate parts into one watertight component', async () => {
  const a = box(2, [0, 0, 0]); // right face at x=1
  const b = box(2, [2.3, 0, 0]); // left face at x=1.3 -> 0.3 gap
  const { stats, manifold } = await remeshToWatertight([a, b], { voxelSize: 0.15, dilate: 0.25 });

  assert.ok(stats.watertight, 'result is watertight');
  assert.ok(Number.isFinite(stats.genus), 'genus is finite');
  assert.ok(stats.volume > 0, 'positive volume');
  assert.equal(manifold.decompose().length, 1, 'dilation bridges the gap into one component');
});

test('remesh with dilate:0 leaves disconnected parts as separate components', async () => {
  const a = box(2, [0, 0, 0]);
  const b = box(2, [3, 0, 0]); // clearly separated, no overlap
  const { manifold } = await remeshToWatertight([a, b], { voxelSize: 0.15, dilate: 0 });
  assert.equal(manifold.decompose().length, 2, 'no dilation -> two components');
});

test('runPipeline poses + remeshes the synthetic rig into a watertight solid', async () => {
  const { root, animations } = makeSyntheticRig();
  const { stats, posedGeometry } = await runPipeline({
    root,
    animations,
    clipName: 'Pose',
    time: 1,
    voxelSize: 0.2,
    dilate: 0.12,
  });
  assert.ok(stats.watertight, 'posed figure is watertight');
  assert.ok(stats.triangles > 0, 'has triangles');
  assert.ok(posedGeometry.boundingBox, 'posed geometry has a bounding box');
});
