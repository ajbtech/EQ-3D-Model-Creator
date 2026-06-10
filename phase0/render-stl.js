// Dependency-free headless renderer: binary STL -> PNG.
//
// A tiny software rasterizer (orthographic projection, z-buffer, Lambert shading)
// plus a minimal PNG encoder using Node's zlib. Renders the model from several
// angles into one image so we can eyeball a result without a browser/GPU.
//
// Usage: node phase0/render-stl.js <in.stl> <out.png>

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const inPath = process.argv[2];
const outPath = process.argv[3] || 'render.png';
if (!inPath) {
  console.error('Usage: node phase0/render-stl.js <in.stl> <out.png>');
  process.exit(1);
}

// --- Read binary STL ---
function readStl(path) {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(80);
  const tris = new Float32Array(n * 9);
  let off = 84;
  for (let i = 0; i < n; i++) {
    off += 12; // skip per-facet normal; we recompute
    for (let v = 0; v < 9; v++) {
      tris[i * 9 + v] = buf.readFloatLE(off);
      off += 4;
    }
    off += 2; // attribute byte count
  }
  return { tris, count: n };
}

// --- Vector helpers ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Rotate point: yaw around Y, then pitch around X.
function rot(p, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let x = cy * p[0] + sy * p[2];
  let z = -sy * p[0] + cy * p[2];
  let y = p[1];
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const y2 = cx * y - sx * z;
  const z2 = sx * y + cx * z;
  return [x, y2, z2];
}

// --- Render one view into an RGB buffer ---
function renderView(tris, count, W, H, yaw, pitch, bg, light) {
  // Bounds of rotated geometry to frame it.
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const rotated = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    for (let v = 0; v < 3; v++) {
      const p = rot([tris[i * 9 + v * 3], tris[i * 9 + v * 3 + 1], tris[i * 9 + v * 3 + 2]], yaw, pitch);
      rotated[i * 9 + v * 3] = p[0];
      rotated[i * 9 + v * 3 + 1] = p[1];
      rotated[i * 9 + v * 3 + 2] = p[2];
      for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
    }
  }
  const sizeX = max[0] - min[0], sizeY = max[1] - min[1];
  const margin = 0.92;
  const scale = Math.min((W * margin) / sizeX, (H * margin) / sizeY);
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
  const toScreen = (p) => [W / 2 + (p[0] - cx) * scale, H / 2 - (p[1] - cy) * scale];

  const img = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { img[i * 3] = bg[0]; img[i * 3 + 1] = bg[1]; img[i * 3 + 2] = bg[2]; }
  const zbuf = new Float32Array(W * H).fill(-Infinity);

  const base = [0.62, 0.70, 0.82]; // cool clay
  for (let i = 0; i < count; i++) {
    const a = [rotated[i * 9], rotated[i * 9 + 1], rotated[i * 9 + 2]];
    const b = [rotated[i * 9 + 3], rotated[i * 9 + 4], rotated[i * 9 + 5]];
    const c = [rotated[i * 9 + 6], rotated[i * 9 + 7], rotated[i * 9 + 8]];
    const n = norm(cross(sub(b, a), sub(c, a)));
    let shade = dot(n, light);
    if (shade < 0) shade = -shade; // two-sided so back faces aren't black
    shade = 0.25 + 0.75 * shade;
    const r = Math.min(255, base[0] * shade * 255) | 0;
    const g = Math.min(255, base[1] * shade * 255) | 0;
    const bl = Math.min(255, base[2] * shade * 255) | 0;

    const sa = toScreen(a), sb = toScreen(b), sc = toScreen(c);
    // Bounding box of the triangle in screen space.
    const minX = Math.max(0, Math.floor(Math.min(sa[0], sb[0], sc[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(sa[0], sb[0], sc[0])));
    const minY = Math.max(0, Math.floor(Math.min(sa[1], sb[1], sc[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(sa[1], sb[1], sc[1])));
    const area = (sb[0] - sa[0]) * (sc[1] - sa[1]) - (sb[1] - sa[1]) * (sc[0] - sa[0]);
    if (area === 0) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((sb[0] - px) * (sc[1] - py) - (sb[1] - py) * (sc[0] - px)) / area;
        const w1 = ((sc[0] - px) * (sa[1] - py) - (sc[1] - py) * (sa[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const idx = y * W + x;
        if (z > zbuf[idx]) {
          zbuf[idx] = z;
          img[idx * 3] = r; img[idx * 3 + 1] = g; img[idx * 3 + 2] = bl;
        }
      }
    }
  }
  return img;
}

// --- Minimal PNG encoder (truecolor, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(img, W, H) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0; // filter: none
    img.subarray(y * W * 3, (y + 1) * W * 3).forEach((v, i) => { raw[y * (W * 3 + 1) + 1 + i] = v; });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- Compose three views side by side ---
const { tris, count } = readStl(inPath);
const VW = 360, VH = 540, GAP = 8;
const bg = [24, 26, 32];
const light = norm([0.4, 0.5, 0.85]);
const views = [
  ['front', 0, -0.18],
  ['3/4', Math.PI * 0.25, -0.22],
  ['side', Math.PI * 0.5, -0.18],
];
const totalW = VW * views.length + GAP * (views.length - 1);
const combined = new Uint8Array(totalW * VH * 3);
for (let i = 0; i < totalW * VH; i++) { combined[i * 3] = bg[0]; combined[i * 3 + 1] = bg[1]; combined[i * 3 + 2] = bg[2]; }

views.forEach(([, yaw, pitch], vi) => {
  const v = renderView(tris, count, VW, VH, yaw, pitch, bg, light);
  const xOff = vi * (VW + GAP);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const src = (y * VW + x) * 3;
      const dst = (y * totalW + (xOff + x)) * 3;
      combined[dst] = v[src]; combined[dst + 1] = v[src + 1]; combined[dst + 2] = v[src + 2];
    }
  }
});

writeFileSync(outPath, encodePng(combined, totalW, VH));
console.log(`Rendered ${count} triangles -> ${outPath} (${totalW}x${VH})`);
