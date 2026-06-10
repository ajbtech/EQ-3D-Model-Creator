import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTextures } from '../phase0/strip-textures.js';

const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;

// Build a minimal two-chunk GLB (JSON + BIN) by hand.
function buildGlb(json, bin) {
  let jsonText = JSON.stringify(json);
  while (jsonText.length % 4 !== 0) jsonText += ' ';
  const jsonBytes = new TextEncoder().encode(jsonText);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const ab = new ArrayBuffer(total);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, JSON_TYPE, true);
  u8.set(jsonBytes, 20);
  const binChunk = 20 + jsonBytes.length;
  dv.setUint32(binChunk, bin.length, true);
  dv.setUint32(binChunk + 4, BIN_TYPE, true);
  u8.set(bin, binChunk + 8);
  return ab;
}

function readJsonChunk(ab) {
  const dv = new DataView(ab);
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, len)));
}

function readBinChunk(ab) {
  const dv = new DataView(ab);
  const jsonLen = dv.getUint32(12, true);
  const binChunk = 20 + jsonLen;
  const len = dv.getUint32(binChunk, true);
  return new Uint8Array(ab.slice(binChunk + 8, binChunk + 8 + len));
}

test('stripTextures removes appearance data but preserves geometry refs + BIN', () => {
  const json = {
    asset: { version: '2.0' },
    images: [{ uri: 'skin.png' }],
    textures: [{ source: 0 }],
    samplers: [{}],
    materials: [{ name: 'body' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  };
  const bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  const out = stripTextures(buildGlb(json, bin));
  const j = readJsonChunk(out);

  assert.equal(j.images, undefined, 'images removed');
  assert.equal(j.textures, undefined, 'textures removed');
  assert.equal(j.samplers, undefined, 'samplers removed');
  assert.equal(j.materials, undefined, 'materials removed');
  assert.equal(j.meshes[0].primitives[0].material, undefined, 'primitive material reference removed');
  assert.deepEqual(j.meshes[0].primitives[0].attributes, { POSITION: 0 }, 'geometry attributes untouched');
  assert.deepEqual([...readBinChunk(out)], [...bin], 'BIN chunk preserved byte-for-byte');
});
