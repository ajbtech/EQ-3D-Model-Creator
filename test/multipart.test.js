import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeSyntheticRig } from '../phase0/fixtures/makeSyntheticRig.js';
import { attachEquipment } from '../phase0/pipeline/attach.js';
import { bakePoseGrouped } from '../phase0/pipeline/pose.js';
import { runMultiPartPipeline } from '../phase0/pipeline/index.js';

function bbox(geometry) {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  return { box: geometry.boundingBox, size };
}

function makeEquipment() {
  const root = new THREE.Object3D();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.1), new THREE.MeshStandardMaterial()));
  return root;
}

test('bakePoseGrouped: no attachment -> body only, no parts', () => {
  const { root, animations } = makeSyntheticRig();
  const { body, parts } = bakePoseGrouped(root, animations, { clipName: 'Pose', time: 0 });
  assert.ok(body && body.getAttribute('position').count > 0, 'body geometry baked');
  assert.equal(parts.length, 0, 'nothing attached -> no equipment parts');
});

test('bakePoseGrouped: attached equipment splits into its own part, excluded from body', () => {
  const { root, animations } = makeSyntheticRig();
  // Attach far out on +X so the equipment occupies a region the body never reaches.
  attachEquipment(root, makeEquipment(), { boneName: 'hand', position: [20, 0, 0] });

  const { body, parts } = bakePoseGrouped(root, animations, { clipName: 'Pose', time: 0 });
  assert.equal(parts.length, 1, 'one equipment holder -> one part');
  assert.equal(parts[0].slot, 'equipment', 'default slot label');

  const part = bbox(parts[0].geometry);
  assert.ok(part.box.min.x > 10, 'equipment part lives out at +X where it was attached');

  const bodyBox = bbox(body);
  assert.ok(bodyBox.box.max.x < 10, 'body geometry excludes the far-out equipment');
});

test('runMultiPartPipeline: body + base + equipment as separate watertight, co-scaled parts', async () => {
  const { root, animations } = makeSyntheticRig();
  attachEquipment(root, makeEquipment(), { boneName: 'hand', position: [0, 4, 0.6] });

  const { parts, factor } = await runMultiPartPipeline({
    root,
    animations,
    clipName: 'Pose',
    time: 0,
    voxelSize: 0.2,
    dilate: 0.12,
    targetHeightMm: 32,
    base: { shape: 'round' },
  });

  const names = parts.map((p) => p.name);
  assert.deepEqual(names, ['body', 'base', 'equipment'], 'body, then base, then equipment');

  for (const part of parts) {
    // levelSet output is watertight by construction; assert it is a real, single solid.
    assert.ok(part.manifold.volume() > 0, `${part.name} has positive volume`);
    assert.ok(Number.isFinite(part.manifold.genus()), `${part.name} has finite genus (closed surface)`);
    assert.equal(part.manifold.decompose().length, 1, `${part.name} is a single component`);
  }

  const bodyBox = bbox(parts[0].geometry);
  assert.ok(bodyBox.size.y > 31 && bodyBox.size.y < 33, `body scaled to ~32mm (got ${bodyBox.size.y.toFixed(2)})`);

  // The equipment must share the body's scale factor so the pieces still register.
  assert.ok(factor > 1, 'figure scaled up from the ~10-unit rig to 32mm');
  const eqBox = bbox(parts[2].geometry);
  // Raw equipment is ~6 units tall; after the shared factor it should be a few mm taller.
  assert.ok(eqBox.size.y > 6 * factor * 0.8, `equipment scaled by the shared factor (~${(6 * factor).toFixed(1)}mm)`);
});
