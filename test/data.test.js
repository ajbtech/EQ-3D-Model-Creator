import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'data');
const load = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

test('poses.json is well-formed and curates at least the 5 plan poses', () => {
  const data = load('poses.json');
  assert.ok(typeof data.sources === 'string' && data.sources.length > 0, 'has a sources note');
  assert.ok(Array.isArray(data.poses) && data.poses.length >= 5, 'at least 5 curated poses');

  const ids = new Set();
  for (const p of data.poses) {
    assert.ok(p.id && typeof p.id === 'string', 'pose has an id');
    assert.ok(!ids.has(p.id), `pose id "${p.id}" is unique`);
    ids.add(p.id);
    assert.ok(p.label && typeof p.label === 'string', `pose ${p.id} has a label`);
    assert.ok(Array.isArray(p.clipCandidates) && p.clipCandidates.length > 0, `pose ${p.id} has clip candidates`);
    assert.ok(p.clipCandidates.every((c) => typeof c === 'string' && c.length > 0), `pose ${p.id} candidates are strings`);
    assert.ok(typeof p.frame === 'number' && p.frame >= 0 && p.frame <= 1, `pose ${p.id} frame in [0,1]`);
  }
});

test('attachments.json is well-formed with bone candidates and default offsets', () => {
  const data = load('attachments.json');
  assert.ok(typeof data.sources === 'string' && data.sources.length > 0, 'has a sources note');
  assert.ok(Array.isArray(data.slots) && data.slots.length > 0, 'has slots');

  for (const s of data.slots) {
    assert.ok(s.id && typeof s.id === 'string', 'slot has an id');
    assert.ok(s.label && typeof s.label === 'string', `slot ${s.id} has a label`);
    assert.ok(Array.isArray(s.boneCandidates) && s.boneCandidates.length > 0, `slot ${s.id} has bone candidates`);
    const o = s.defaultOffset;
    assert.ok(o && Array.isArray(o.position) && o.position.length === 3, `slot ${s.id} has a position offset`);
    assert.ok(Array.isArray(o.rotationEuler) && o.rotationEuler.length === 3, `slot ${s.id} has a rotation offset`);
  }
});

test('items.json is well-formed (id -> appearance), entries typed', () => {
  const data = load('items.json');
  assert.ok(typeof data.sources === 'string' && data.sources.length > 0, 'has a sources note');
  assert.ok(data.items && typeof data.items === 'object', 'has an items map');
  const known = new Set(['weapon1h', 'weapon2h', 'shield', 'helm', 'robe']);
  for (const [id, e] of Object.entries(data.items)) {
    assert.ok(/^\d+$/.test(id), `item key ${id} is a numeric id`);
    assert.ok(typeof e.idfile === 'string' && /^IT\d+$/i.test(e.idfile), `item ${id} has an IT### idfile`);
    assert.ok(known.has(e.type), `item ${id} has a known type`);
  }
});

test('races.json is well-formed with positive target heights', () => {
  const data = load('races.json');
  assert.ok(typeof data.sources === 'string' && data.sources.length > 0, 'has a sources note');
  assert.ok(Array.isArray(data.races) && data.races.length > 0, 'has races');

  for (const r of data.races) {
    assert.ok(r.code && typeof r.code === 'string', 'race has a code');
    assert.ok(r.label && typeof r.label === 'string', `race ${r.code} has a label`);
    assert.ok(typeof r.targetHeightMm === 'number' && r.targetHeightMm > 0, `race ${r.code} has a positive target height`);
  }
});
