import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLoadout } from '../phase0/pipeline/loadout.js';

const itemsDb = {
  5081: { idfile: 'IT63', type: 'weapon1h', name: 'Fine Steel Long Sword' },
  2345: { idfile: 'IT200', type: 'shield', name: 'Large Wooden Shield' },
  999: { idfile: 'IT637', type: 'helm', name: 'Iron Helm' },
  888: { idfile: 'IT540', type: 'robe', name: 'Robe of the Oracle' },
  6000: { idfile: 'IT64', type: 'weapon1h', name: 'Off-hand Dagger' },
};
const attachmentsDb = {
  slots: [
    { id: 'primary', boneCandidates: ['r_point'], defaultOffset: { position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: 1 } },
    { id: 'shield', boneCandidates: ['shield_point', 'l_point'], defaultOffset: { position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: 1 } },
    { id: 'offhand', boneCandidates: ['l_point'], defaultOffset: { position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: 1 } },
    { id: 'helm', boneCandidates: ['head_point'], defaultOffset: { position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: 1 } },
    { id: 'robe', boneCandidates: ['ch'], defaultOffset: { position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: 1 } },
  ],
};

test('resolveLoadout maps each visible item to an attachment slot + bone', () => {
  const equipped = [
    { slot: 'primary', location: 'Primary', name: 'Fine Steel Long Sword', id: 5081 },
    { slot: 'secondary', location: 'Secondary', name: 'Large Wooden Shield', id: 2345 },
    { slot: 'head', location: 'Head', name: 'Iron Helm', id: 999 },
    { slot: 'chest', location: 'Chest', name: 'Robe of the Oracle', id: 888 },
  ];
  const out = resolveLoadout(equipped, itemsDb, attachmentsDb);
  const by = (s) => out.find((o) => o.attachSlot === s);

  assert.equal(by('primary').idfile, 'IT63');
  assert.deepEqual(by('primary').boneCandidates, ['r_point']);
  assert.equal(by('shield').idfile, 'IT200', 'a shield in Secondary -> shield slot');
  assert.equal(by('helm').boneCandidates[0], 'head_point');
  assert.equal(by('robe').boneCandidates[0], 'ch');
  assert.ok(out.every((o) => o.matched), 'all four matched');
});

test('a weapon in the Secondary slot routes to the off-hand, not shield', () => {
  const equipped = [{ slot: 'secondary', location: 'Secondary', name: 'Off-hand Dagger', id: 6000 }];
  const out = resolveLoadout(equipped, itemsDb, attachmentsDb);
  assert.equal(out[0].attachSlot, 'offhand');
  assert.deepEqual(out[0].boneCandidates, ['l_point']);
});

test('unknown items are reported as unmatched, not dropped or fatal', () => {
  const equipped = [{ slot: 'primary', location: 'Primary', name: 'Mystery Blade', id: 7777 }];
  const out = resolveLoadout(equipped, itemsDb, attachmentsDb);
  assert.equal(out.length, 1);
  assert.equal(out[0].matched, false);
  assert.equal(out[0].name, 'Mystery Blade', 'keeps the name so the UI can show what is missing');
});
