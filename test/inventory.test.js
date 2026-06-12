import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInventory, equippedVisibleItems } from '../phase0/pipeline/inventory.js';

// A representative slice of a /outputfile inventory dump (tab-delimited).
const SAMPLE = [
  'Location\tName\tID\tCount\tSlots',
  'Charm\tCharm of Mana\t1001\t1\t0',
  'Ear\tEarring of Essence\t1002\t1\t0',
  'Head\tIron Helm\t999\t1\t0',
  'Primary\tFine Steel Long Sword\t5081\t1\t0',
  'Secondary\tLarge Wooden Shield\t2345\t1\t0',
  'Chest\tRobe of the Oracle\t888\t1\t0',
  'Range\tEmpty\t0\t0\t0',
  'Feet\tLeather Boots\t222\t1\t0',
  'General1\tLarge Bag\t777\t1\t10',
  'General1-Slot1\tWater Flask\t111\t1\t0',
  'Bank1\tSpare Sword\t5081\t1\t0',
].join('\n');

test('parseInventory reads tab-delimited rows and skips the header', () => {
  const rows = parseInventory(SAMPLE);
  assert.ok(rows.length >= 10, 'parses all non-header rows');
  assert.equal(rows.find((r) => r.location === 'Primary').name, 'Fine Steel Long Sword');
  assert.equal(rows.find((r) => r.location === 'Primary').id, 5081, 'id is numeric');
  assert.ok(!rows.some((r) => r.location === 'Location'), 'header row is not included');
});

test('equippedVisibleItems keeps only visible equip slots', () => {
  const items = equippedVisibleItems(parseInventory(SAMPLE));
  const slots = items.map((i) => i.location).sort();
  assert.deepEqual(slots, ['Chest', 'Head', 'Primary', 'Secondary'], 'only Primary/Secondary/Head/Chest');
});

test('equippedVisibleItems drops empty slots, bags, bank and invisible slots', () => {
  const items = equippedVisibleItems(parseInventory(SAMPLE));
  assert.ok(!items.some((i) => i.name === 'Empty'), 'no empty slots');
  assert.ok(!items.some((i) => i.location.startsWith('General')), 'no bag contents');
  assert.ok(!items.some((i) => i.location.startsWith('Bank')), 'no bank contents');
  assert.ok(!items.some((i) => i.location === 'Ear' || i.location === 'Charm' || i.location === 'Feet'), 'no invisible slots');
});
