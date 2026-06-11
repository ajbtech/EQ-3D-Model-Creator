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
