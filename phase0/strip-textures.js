// Strip images/textures/materials/samplers from a GLB's JSON chunk so three's
// GLTFLoader can parse it in Node without a browser DOM (texture decoding needs
// self.URL / createImageBitmap). Geometry, skins, and animations are untouched,
// and the print-prep remesh discards appearance anyway. Node-only helper -- the
// browser viewer loads textures normally.
export function stripTextures(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const JSON_TYPE = 0x4e4f534a; // 'JSON'
  const total = dv.getUint32(8, true);
  let offset = 12;
  let jsonStart = 0;
  let jsonLen = 0;
  let json = null;
  while (offset < total) {
    const chunkLen = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (chunkType === JSON_TYPE) {
      jsonStart = dataStart;
      jsonLen = chunkLen;
      const text = new TextDecoder().decode(new Uint8Array(arrayBuffer, dataStart, chunkLen));
      json = JSON.parse(text);
      break;
    }
    offset = dataStart + chunkLen;
  }
  if (!json) return arrayBuffer;

  delete json.images;
  delete json.textures;
  delete json.materials;
  delete json.samplers;
  if (Array.isArray(json.meshes)) {
    for (const mesh of json.meshes) {
      for (const prim of mesh.primitives || []) delete prim.material;
    }
  }

  let newText = JSON.stringify(json);
  while (newText.length % 4 !== 0) newText += ' ';
  const newJsonBytes = new TextEncoder().encode(newText);

  const tail = new Uint8Array(arrayBuffer, jsonStart + jsonLen);
  const out = new ArrayBuffer(12 + 8 + newJsonBytes.length + tail.length);
  const odv = new DataView(out);
  const ob = new Uint8Array(out);
  odv.setUint32(0, 0x46546c67, true); // 'glTF'
  odv.setUint32(4, 2, true);
  odv.setUint32(8, out.byteLength, true);
  odv.setUint32(12, newJsonBytes.length, true);
  odv.setUint32(16, JSON_TYPE, true);
  ob.set(newJsonBytes, 20);
  ob.set(tail, 20 + newJsonBytes.length);
  return out;
}
