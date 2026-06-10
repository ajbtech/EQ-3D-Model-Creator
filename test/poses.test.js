import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePose } from '../phase0/pipeline/poses.js';

// AnimationClip-compatible stand-ins: only .name and .duration are used.
const clips = [
  { name: 'Stand', duration: 0.9 },
  { name: 'Wave', duration: 1.7 },
  { name: 'Combat 2H Slash', duration: 1.2 },
];

test('resolvePose picks the first available candidate and converts frame fraction to seconds', () => {
  const r = resolvePose(clips, { clipCandidates: ['Idle', 'Stand'], frame: 0.5 });
  assert.deepEqual(r, { clipName: 'Stand', time: 0.45 }, 'falls through to Stand; 0.5 * 0.9 = 0.45s');
});

test('resolvePose respects candidate priority order', () => {
  const r = resolvePose(clips, { clipCandidates: ['Wave', 'Stand'], frame: 0 });
  assert.equal(r.clipName, 'Wave', 'first matching candidate wins');
  assert.equal(r.time, 0, 'frame 0 -> 0 seconds');
});

test('resolvePose defaults the frame to mid-clip when unspecified', () => {
  const r = resolvePose(clips, { clipCandidates: ['Wave'] });
  assert.equal(r.clipName, 'Wave');
  assert.ok(Math.abs(r.time - 0.85) < 1e-9, 'default frame 0.5 -> 0.5 * 1.7 = 0.85s');
});

test('resolvePose returns null when no candidate clip exists', () => {
  const r = resolvePose(clips, { clipCandidates: ['Nonexistent Clip'], frame: 0.5 });
  assert.equal(r, null);
});

test('resolvePose handles an empty clip list', () => {
  assert.equal(resolvePose([], { clipCandidates: ['Stand'], frame: 0.5 }), null);
});
