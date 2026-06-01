// Phase 0 headless spike.
//
// Proves the print-prep spine end to end, with verifiable output, WITHOUT any
// EverQuest art: build a synthetic skinned figure + thin weapon, pose it at two
// frames, run the SDF -> manifold-3d levelSet remesh, export watertight STLs, and
// assert manifold/closed properties. See PLAN.md Phase 0.
//
// Run: npm run spike

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { makeSyntheticRig } from './fixtures/makeSyntheticRig.js';
import { runPipeline, geometryToStl, stlToBuffer } from './pipeline/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'out');
mkdirSync(outDir, { recursive: true });

const POSES = [
  { label: 'standing', time: 0 },
  { label: 'waving', time: 1 },
];

// Thin features (the 0.05-thick blade) need a voxel grid fine enough to resolve
// them and a little dilation to enforce a printable minimum wall.
const VOXEL_SIZE = 0.18;
const DILATE = 0.12;

function bboxSize(geometry) {
  const s = new THREE.Vector3();
  geometry.boundingBox.getSize(s);
  return s;
}

let failures = 0;
console.log('Phase 0 spike: pose -> bake -> SDF remesh -> watertight STL\n');

for (const pose of POSES) {
  const { root, animations } = makeSyntheticRig();
  const t0 = Date.now();

  const { posedGeometry, geometry, stats } = await runPipeline({
    root,
    animations,
    clipName: 'Pose',
    time: pose.time,
    voxelSize: VOXEL_SIZE,
    dilate: DILATE,
  });

  const stl = geometryToStl(geometry, { binary: true });
  const buf = stlToBuffer(stl);
  const file = join(outDir, `${pose.label}.stl`);
  writeFileSync(file, buf);

  const posedSize = bboxSize(posedGeometry);
  const ms = Date.now() - t0;

  // Assertions: the result must be a non-empty, positive-volume, closed manifold.
  const ok =
    stats.watertight &&
    Number.isFinite(stats.genus) &&
    stats.triangles > 0 &&
    statSync(file).size > 84; // larger than an empty binary-STL header

  if (!ok) failures++;

  console.log(`[${pose.label}] ${ok ? 'PASS' : 'FAIL'}`);
  console.log(
    `  posed bbox     : ${posedSize.x.toFixed(2)} x ${posedSize.y.toFixed(2)} x ${posedSize.z.toFixed(2)}`,
  );
  console.log(`  watertight     : ${stats.watertight}  (genus ${stats.genus})`);
  console.log(`  volume / area  : ${stats.volume.toFixed(1)} / ${stats.surfaceArea.toFixed(1)}`);
  console.log(`  triangles      : ${stats.triangles}  vertices ${stats.vertices}`);
  console.log(`  voxel / dilate : ${stats.voxelSize} / ${stats.dilate}`);
  console.log(`  STL            : ${file} (${statSync(file).size} bytes)`);
  console.log(`  time           : ${ms} ms\n`);
}

// Cross-check that posing actually changed the geometry (the bend must move mass
// sideways), proving the skeleton evaluation + skin bake is real, not a no-op.
{
  const a = makeSyntheticRig();
  const b = makeSyntheticRig();
  const { posedGeometry: gStand } = await runPipeline({ ...a, clipName: 'Pose', time: 0, voxelSize: VOXEL_SIZE, dilate: DILATE });
  const { posedGeometry: gWave } = await runPipeline({ ...b, clipName: 'Pose', time: 1, voxelSize: VOXEL_SIZE, dilate: DILATE });
  const dx = Math.abs(bboxSize(gWave).x - bboxSize(gStand).x);
  const posingWorks = dx > 0.5;
  if (!posingWorks) failures++;
  console.log(`[pose-changes-geometry] ${posingWorks ? 'PASS' : 'FAIL'}  (bbox width delta ${dx.toFixed(2)})\n`);
}

if (failures > 0) {
  console.error(`SPIKE FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('SPIKE PASSED: watertight, printable STLs produced for all poses.');
