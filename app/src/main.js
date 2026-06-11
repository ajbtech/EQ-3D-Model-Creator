import './styles.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  bakePose,
  remeshToWatertight,
  geometryToStl,
  scaleGeometryToHeight,
  resolvePose,
  withBase,
  resolveBone,
  attachEquipment,
  detachEquipment,
  listBones,
} from '../../phase0/pipeline/index.js';
import { createViewer } from './scene.js';
import racesData from '../data/races.json';
import posesData from '../data/poses.json';
import attachmentsData from '../data/attachments.json';

const $ = (id) => document.getElementById(id);
const log = (msg) => { $('status').textContent = msg; };

const viewer = createViewer($('viewport'));

const state = {
  loaded: null, // { root, animations }
  posed: null, // baked BufferGeometry for the chosen pose
  pose: null, // the active pose definition
  resolved: null, // resolved { clipName, time } for the active pose
  equipment: null, // loaded equipment gltf.scene (attached to a bone)
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
    state.resolved = null;
    state.equipment = null;
    $('generate').disabled = true;
    $('download').disabled = true;
    $('stats').textContent = '';

    viewer.show(state.loaded.root);
    buildPoseButtons();
    setupEquipment();

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
  state.pose = pose;
  state.resolved = resolved;
  rebake();
}

// Bake the active pose (with any attached equipment baked in) and preview it.
function rebake() {
  if (!state.loaded || !state.resolved) return;
  try {
    const { geometry } = bakePose(state.loaded.root, state.loaded.animations, {
      clipName: state.resolved.clipName,
      time: state.resolved.time,
    });
    state.posed = geometry;
    viewer.showGeometry(geometry, 0x7fa7d4);
    $('generate').disabled = false;
    $('download').disabled = true;
    log(`Posed as “${state.pose.label}” (clip: ${state.resolved.clipName}).\nReady to generate the printable model.`);
  } catch (err) {
    console.error(err);
    log(`Pose failed: ${err.message}`);
  }
}

// --- Equipment ----------------------------------------------------------
const RAD = Math.PI / 180;
const slotById = (id) => attachmentsData.slots.find((s) => s.id === id);

// One-time: fill the slot dropdown.
$('eqSlot').innerHTML = attachmentsData.slots.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');

function setupEquipment() {
  $('eqFile').disabled = false;
  $('eqFile').value = '';
  $('eqControls').hidden = true;
  state.equipment = null;
  // Populate the bone picker from this model's actual skeleton.
  const bones = listBones(state.loaded.root);
  $('eqBone').innerHTML = bones.map((b) => `<option>${b}</option>`).join('');
}

function readOffset() {
  return {
    position: [Number($('eqPosX').value), Number($('eqPosY').value), Number($('eqPosZ').value)],
    rotationEuler: [Number($('eqRotX').value) * RAD, Number($('eqRotY').value) * RAD, Number($('eqRotZ').value) * RAD],
    scale: Number($('eqScale').value),
  };
}

function applySlotDefaults(slotId) {
  const slot = slotById(slotId);
  const o = slot.defaultOffset;
  $('eqPosX').value = o.position[0];
  $('eqPosY').value = o.position[1];
  $('eqPosZ').value = o.position[2];
  $('eqRotX').value = Math.round(o.rotationEuler[0] / RAD);
  $('eqRotY').value = Math.round(o.rotationEuler[1] / RAD);
  $('eqRotZ').value = Math.round(o.rotationEuler[2] / RAD);
  $('eqScale').value = o.scale ?? 1;
  // Auto-resolve the bone for this slot against the model's skeleton.
  const resolved = resolveBone(listBones(state.loaded.root), slot.boneCandidates);
  if (resolved) $('eqBone').value = resolved;
}

function attachAndPreview() {
  if (!state.equipment) return;
  const boneName = $('eqBone').value;
  if (!boneName) { log('Pick a bone to attach the equipment to.'); return; }
  try {
    attachEquipment(state.loaded.root, state.equipment, { boneName, ...readOffset() });
    if (state.resolved) rebake();
    else viewer.show(state.loaded.root);
  } catch (err) {
    console.error(err);
    log(`Attach failed: ${err.message}`);
  }
}

$('eqFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !state.loaded) return;
  try {
    const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '');
    state.equipment = gltf.scene;
    $('eqControls').hidden = false;
    applySlotDefaults($('eqSlot').value);
    attachAndPreview();
    log(`Attached ${file.name}. Nudge the sliders to seat it in the hand.`);
  } catch (err) {
    console.error(err);
    log(`Failed to load equipment: ${err.message}`);
  }
});

$('eqSlot').addEventListener('change', () => { applySlotDefaults($('eqSlot').value); attachAndPreview(); });
$('eqBone').addEventListener('change', attachAndPreview);
['eqPosX', 'eqPosY', 'eqPosZ', 'eqRotX', 'eqRotY', 'eqRotZ', 'eqScale'].forEach((id) => {
  $(id).addEventListener('input', attachAndPreview);
});
$('eqRemove').addEventListener('click', () => {
  if (!state.loaded) return;
  detachEquipment(state.loaded.root);
  state.equipment = null;
  $('eqControls').hidden = true;
  $('eqFile').value = '';
  if (state.resolved) rebake(); else viewer.show(state.loaded.root);
});

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
    const { geometry, manifold, stats } = await remeshToWatertight(state.posed, { voxelSize: voxel, dilate });
    const entry = currentRaceEntry();

    // Add a stability base (fused via exact manifold union) or just scale to height.
    let scaled;
    if ($('baseOn').checked) {
      ({ geometry: scaled } = await withBase(manifold, {
        targetHeightMm: entry.targetHeightMm,
        shape: $('baseShape').value,
      }));
    } else {
      ({ geometry: scaled } = scaleGeometryToHeight(geometry, entry.targetHeightMm, 'y'));
    }
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
