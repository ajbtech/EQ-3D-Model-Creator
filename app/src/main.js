import './styles.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  bakePose,
  remeshToWatertight,
  geometryToStl,
  scaleGeometryToHeight,
  resolvePose,
} from '../../phase0/pipeline/index.js';
import { createViewer } from './scene.js';
import racesData from '../data/races.json';
import posesData from '../data/poses.json';

const $ = (id) => document.getElementById(id);
const log = (msg) => { $('status').textContent = msg; };

const viewer = createViewer($('viewport'));

const state = {
  loaded: null, // { root, animations }
  posed: null, // baked BufferGeometry for the chosen pose
  pose: null, // the active pose definition
  scaled: null, // remeshed + scaled geometry
  stl: null, // DataView for download
};

// --- Race / gender pickers ---------------------------------------------
const raceNames = [...new Set(racesData.races.map((r) => r.race))];
function fillRaces() {
  $('race').innerHTML = raceNames.map((n) => `<option>${n}</option>`).join('');
  $('race').disabled = false;
  $('gender').disabled = false;
  syncGenders();
}
function syncGenders() {
  const genders = racesData.races.filter((r) => r.race === $('race').value).map((r) => r.gender);
  $('gender').innerHTML = genders.map((g) => `<option>${g}</option>`).join('');
  syncScaleHint();
}
function currentRaceEntry() {
  return racesData.races.find((r) => r.race === $('race').value && r.gender === $('gender').value);
}
function syncScaleHint() {
  const e = currentRaceEntry();
  $('scaleHint').textContent = e ? `Figurine will be scaled to ${e.targetHeightMm} mm tall (${e.label}).` : '';
}
$('race').addEventListener('change', syncGenders);
$('gender').addEventListener('change', syncScaleHint);
fillRaces();

// --- Upload -------------------------------------------------------------
$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  log(`Loading ${file.name}…`);
  try {
    const buf = await file.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    state.loaded = { root: gltf.scene, animations: gltf.animations || [] };
    state.posed = null;
    state.pose = null;
    $('generate').disabled = true;
    $('download').disabled = true;
    $('stats').textContent = '';

    viewer.show(state.loaded.root);
    buildPoseButtons();

    let meshes = 0;
    state.loaded.root.traverse((o) => { if (o.isMesh) meshes++; });
    log(`Loaded ${file.name}\nmeshes: ${meshes}\nanimations: ${state.loaded.animations.length}\nPick a pose to continue.`);
  } catch (err) {
    console.error(err);
    log(`Failed to load: ${err.message}\nTip: prefer a self-contained .glb.`);
  }
});

// --- Pose buttons -------------------------------------------------------
function buildPoseButtons() {
  const container = $('poses');
  container.innerHTML = '';
  const clips = state.loaded.animations;
  for (const pose of posesData.poses) {
    const resolved = resolvePose(clips, pose);
    const btn = document.createElement('button');
    btn.textContent = pose.label;
    if (!resolved) {
      btn.disabled = true;
      btn.title = 'No matching animation in this model';
    } else {
      btn.title = `clip: ${resolved.clipName}`;
      btn.addEventListener('click', () => selectPose(pose, resolved, btn));
    }
    container.appendChild(btn);
  }
}

function selectPose(pose, resolved, btn) {
  [...$('poses').children].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  try {
    const { geometry } = bakePose(state.loaded.root, state.loaded.animations, {
      clipName: resolved.clipName,
      time: resolved.time,
    });
    state.posed = geometry;
    state.pose = pose;
    viewer.showGeometry(geometry, 0x7fa7d4);
    $('generate').disabled = false;
    $('download').disabled = true;
    log(`Posed as “${pose.label}” (clip: ${resolved.clipName}).\nReady to generate the printable model.`);
  } catch (err) {
    console.error(err);
    log(`Pose failed: ${err.message}`);
  }
}

// --- Generate (remesh + scale) -----------------------------------------
$('generate').addEventListener('click', async () => {
  if (!state.posed) return;
  $('generate').disabled = true;
  log('Generating… SDF remesh + watertight extraction. This can take several seconds.');
  await new Promise((r) => setTimeout(r, 30)); // let the status paint

  try {
    const voxel = Number($('voxel').value) || undefined;
    const dilateRaw = $('dilate').value.trim();
    const dilate = dilateRaw === '' ? undefined : Number(dilateRaw);

    const t0 = performance.now();
    const { geometry, stats } = await remeshToWatertight(state.posed, { voxelSize: voxel, dilate });
    const entry = currentRaceEntry();
    const { geometry: scaled } = scaleGeometryToHeight(geometry, entry.targetHeightMm, 'y');
    const ms = Math.round(performance.now() - t0);

    scaled.computeBoundingBox();
    const size = new THREE.Vector3();
    scaled.boundingBox.getSize(size);

    state.scaled = scaled;
    state.stl = geometryToStl(scaled, { binary: true });
    viewer.showGeometry(scaled, 0x9ad48f);
    $('download').disabled = false;

    $('stats').textContent =
      `watertight: ${stats.watertight}  (genus ${stats.genus})\n` +
      `triangles: ${stats.triangles}\n` +
      `height: ${size.y.toFixed(1)} mm  (footprint ${size.x.toFixed(1)} × ${size.z.toFixed(1)} mm)`;
    log(`Done in ${ms} ms. Download your STL below.`);
  } catch (err) {
    console.error(err);
    log(`Generate failed: ${err.message}`);
  } finally {
    $('generate').disabled = false;
  }
});

// --- Download -----------------------------------------------------------
$('download').addEventListener('click', () => {
  if (!state.stl) return;
  const entry = currentRaceEntry();
  const name = `${entry ? entry.code : 'model'}-${state.pose ? state.pose.id : 'pose'}.stl`;
  const blob = new Blob([state.stl.buffer ?? state.stl], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
});
