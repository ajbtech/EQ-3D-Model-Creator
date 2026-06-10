// Validate a real extracted glTF against the Phase 0 pipeline.
//
// Usage: node phase0/validate-glb.js <path-to.glb> [clipName] [time]
//
// Loads the file headless, reports its meshes / skeleton / animation clips, then
// runs pose -> bake -> watertight remesh -> STL and verifies the result. This is
// the real-art counterpart to run-spike.js (which uses a synthetic rig). The .glb
// itself is the user's own EQ art and is never committed.

import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { runPipeline, geometryToStl, stlToBuffer } from './pipeline/index.js';
import { stripTextures } from './strip-textures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'out');
mkdirSync(outDir, { recursive: true });

const inPath = process.argv[2];
if (!inPath) {
  console.error('Usage: node phase0/validate-glb.js <path-to.glb> [clipName] [time]');
  process.exit(1);
}
const clipNameArg = process.argv[3];
const timeArg = process.argv[4] !== undefined ? Number(process.argv[4]) : undefined;

function loadGltf(path) {
  const data = readFileSync(path);
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const stripped = stripTextures(ab);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(stripped, '', resolve, reject);
  });
}

const gltf = await loadGltf(inPath);
const root = gltf.scene;
const animations = gltf.animations || [];

// --- Report what came in ---
let meshCount = 0;
let skinnedCount = 0;
const bones = new Set();
root.updateMatrixWorld(true);
root.traverse((o) => {
  if (o.isSkinnedMesh) {
    skinnedCount++;
    if (o.skeleton) o.skeleton.bones.forEach((b) => bones.add(b.name));
  } else if (o.isMesh) {
    meshCount++;
  }
});

console.log(`\nLoaded: ${basename(inPath)}`);
console.log(`  meshes (static)   : ${meshCount}`);
console.log(`  skinned meshes    : ${skinnedCount}`);
console.log(`  bones             : ${bones.size}`);
console.log(`  animation clips   : ${animations.length}`);
if (animations.length) {
  for (const c of animations) {
    console.log(`     - ${c.name}  (${c.duration.toFixed(2)}s, ${c.tracks.length} tracks)`);
  }
} else {
  console.log('  WARNING: no animation clips -> ExportAllAnimationFrames was likely off');
}

// --- Pick a clip + time and run the pipeline ---
const clip = clipNameArg
  ? THREE.AnimationClip.findByName(animations, clipNameArg)
  : animations[0];
const clipName = clip ? clip.name : undefined;
const time = timeArg ?? (clip ? clip.duration * 0.5 : 0);

console.log(`\nRunning pipeline: clip="${clipName ?? '(none/static)'}" time=${time.toFixed(2)}s`);
const t0 = Date.now();
const { posedGeometry, geometry, manifold, stats } = await runPipeline({
  root,
  animations,
  clipName,
  time,
  // auto voxel size + auto ~1-voxel dilation (fuses the model's separate parts)
});
const components = manifold.decompose().length;
const ms = Date.now() - t0;

const posedBox = posedGeometry.boundingBox;
const ps = new THREE.Vector3();
posedBox.getSize(ps);

const stl = geometryToStl(geometry, { binary: true });
const file = join(outDir, basename(inPath).replace(/\.glb$/i, '') + '.stl');
writeFileSync(file, stlToBuffer(stl));

const ok = stats.watertight && Number.isFinite(stats.genus) && stats.triangles > 0 && statSync(file).size > 84;

console.log(`\n[validate] ${ok ? 'PASS' : 'FAIL'}`);
console.log(`  posed bbox     : ${ps.x.toFixed(2)} x ${ps.y.toFixed(2)} x ${ps.z.toFixed(2)}`);
console.log(`  watertight     : ${stats.watertight}  (genus ${stats.genus}, ${components} component${components === 1 ? '' : 's'})`);
console.log(`  volume / area  : ${stats.volume.toFixed(2)} / ${stats.surfaceArea.toFixed(2)}`);
console.log(`  triangles      : ${stats.triangles}  vertices ${stats.vertices}`);
console.log(`  voxel / dilate : ${stats.voxelSize.toFixed(4)} / ${stats.dilate}`);
console.log(`  STL            : ${file} (${statSync(file).size} bytes)`);
console.log(`  time           : ${ms} ms`);

process.exit(ok ? 0 : 1);
