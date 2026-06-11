import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveBone, attachEquipment } from '../phase0/pipeline/attach.js';

test('resolveBone returns the first matching candidate (case-insensitive)', () => {
  const bones = ['ROOT', 'Spine', 'r_hand', 'l_hand'];
  assert.equal(resolveBone(bones, ['rhand', 'r_hand']), 'r_hand', 'priority order, exact name returned');
  assert.equal(resolveBone(bones, ['R_HAND']), 'r_hand', 'case-insensitive match keeps actual bone name');
  assert.equal(resolveBone(bones, ['nope']), null, 'no match -> null');
  assert.equal(resolveBone([], ['r_hand']), null, 'empty bone list -> null');
});

test('attachEquipment places equipment at the bone + offset, baked into the tree', () => {
  const root = new THREE.Object3D();
  const bone = new THREE.Bone();
  bone.name = 'hand';
  bone.position.set(0, 5, 0);
  root.add(bone);

  const equipment = new THREE.Object3D();
  equipment.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

  const holder = attachEquipment(root, equipment, { boneName: 'hand', position: [2, 0, 0] });
  root.updateMatrixWorld(true);

  const world = new THREE.Vector3().setFromMatrixPosition(holder.matrixWorld);
  assert.ok(world.distanceTo(new THREE.Vector3(2, 5, 0)) < 1e-6, 'equipment sits at bone(0,5,0) + offset(2,0,0)');

  // The equipment mesh is now part of the character tree (so bakePose will include it).
  let found = false;
  root.traverse((o) => { if (o.isMesh) found = true; });
  assert.ok(found, 'equipment mesh is reachable under the character root');
});

test('attachEquipment replaces a previous attachment rather than stacking', () => {
  const root = new THREE.Object3D();
  const bone = new THREE.Bone();
  bone.name = 'hand';
  root.add(bone);
  const equipment = new THREE.Object3D();
  equipment.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

  attachEquipment(root, equipment, { boneName: 'hand', position: [1, 0, 0] });
  attachEquipment(root, equipment, { boneName: 'hand', position: [3, 0, 0] });

  let attachments = 0;
  root.traverse((o) => { if (o.userData.isEquipmentAttachment) attachments++; });
  assert.equal(attachments, 1, 're-attaching replaces the previous holder');
});

test('attachEquipment throws when the bone is missing', () => {
  const root = new THREE.Object3D();
  const equipment = new THREE.Object3D();
  assert.throws(() => attachEquipment(root, equipment, { boneName: 'nope' }), /bone/i);
});
