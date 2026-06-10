// Phase 0 browser app. Reuses the exact same pipeline modules as the headless
// spike (../pipeline/*), so what is proven in Node is what runs here.
//
// Status: the headless pipeline is fully verified (npm run spike). This in-browser
// UI is provided as the Phase 0 viewer for loading a *real* extracted glTF; it
// depends on WebGL + CDN-served WASM and should be opened in a browser to confirm.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bakePose } from '../pipeline/pose.js';
import { remeshToWatertight } from '../pipeline/remesh.js';
import { geometryToStl } from '../pipeline/exportStl.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const log = (msg) => { statusEl.textContent = msg; };

// --- Scene setup ---------------------------------------------------------
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
camera.position.set(20, 20, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(1, 2, 1);
scene.add(key);
const grid = new THREE.GridHelper(100, 20, 0x335577, 0x223344);
scene.add(grid);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

// --- State ---------------------------------------------------------------
let loaded = null;        // { root, animations }
let displayObject = null; // current THREE.Object3D shown
let lastStl = null;       // DataView for download

function show(object3d) {
  if (displayObject) scene.remove(displayObject);
  displayObject = object3d;
  scene.add(object3d);
  frameCameraTo(object3d);
}

function frameCameraTo(object3d) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) || 10;
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius, radius, radius * 1.5));
  camera.near = radius / 100;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
}

function meshFrom(geometry, color = 0x9db4cf) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, flatShading: false }),
  );
}

// --- Load ----------------------------------------------------------------
$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  log(`Loading ${file.name}…`);
  try {
    const buf = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buf, '');
    loaded = { root: gltf.scene, animations: gltf.animations || [] };

    // Populate clip selector.
    const clipSel = $('clip');
    clipSel.innerHTML = '';
    if (loaded.animations.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '(no animations in file)';
      clipSel.appendChild(opt);
      clipSel.disabled = true;
      $('time').disabled = true;
    } else {
      for (const clip of loaded.animations) {
        const opt = document.createElement('option');
        opt.value = clip.name;
        opt.textContent = `${clip.name}  (${clip.duration.toFixed(2)}s)`;
        clipSel.appendChild(opt);
      }
      clipSel.disabled = false;
      $('time').disabled = false;
    }
    syncTimeMax();

    show(loaded.root);
    $('bake').disabled = false;
    $('remesh').disabled = false;

    const meshCount = countMeshes(loaded.root);
    log(
      `Loaded ${file.name}\n` +
      `meshes: ${meshCount}\n` +
      `animations: ${loaded.animations.length}` +
      (loaded.animations.length ? `\nclips: ${loaded.animations.map((c) => c.name).join(', ')}` : '\n(no skeleton animations found)'),
    );
  } catch (err) {
    console.error(err);
    log(`Failed to load: ${err.message}\nTip: prefer a self-contained .glb.`);
  }
});

function countMeshes(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

function currentClipName() {
  const sel = $('clip');
  return sel.disabled ? undefined : sel.value;
}

function syncTimeMax() {
  const name = currentClipName();
  const clip = name && THREE.AnimationClip.findByName(loaded.animations, name);
  const dur = clip ? clip.duration : 1;
  const t = $('time');
  t.max = String(dur);
  t.step = String(Math.max(0.001, dur / 100));
}

$('clip').addEventListener('change', syncTimeMax);
$('time').addEventListener('input', () => { $('timeLabel').textContent = Number($('time').value).toFixed(2); });

// --- Bake / preview pose -------------------------------------------------
$('bake').addEventListener('click', () => {
  if (!loaded) return;
  try {
    const time = Number($('time').value);
    const { geometry, meshCount } = bakePose(loaded.root, loaded.animations, { clipName: currentClipName(), time });
    show(meshFrom(geometry, 0x7fa7d4));
    log(`Posed & baked ${meshCount} mesh(es) at t=${time.toFixed(2)}s.\nReady to remesh.`);
  } catch (err) {
    console.error(err);
    log(`Bake failed: ${err.message}`);
  }
});

// --- Remesh --------------------------------------------------------------
$('remesh').addEventListener('click', async () => {
  if (!loaded) return;
  $('remesh').disabled = true;
  log('Remeshing… (SDF sampling + manifold levelSet — this can take a few seconds)');
  // Yield so the status paints before the heavy synchronous work.
  await new Promise((r) => setTimeout(r, 30));
  try {
    const time = Number($('time').value);
    const { geometry: posed } = bakePose(loaded.root, loaded.animations, { clipName: currentClipName(), time });

    const voxel = Number($('voxel').value) || undefined;
    const dilate = Number($('dilate').value) || 0;
    const t0 = performance.now();
    const { geometry, stats } = await remeshToWatertight(posed, { voxelSize: voxel, dilate });
    const ms = Math.round(performance.now() - t0);

    show(meshFrom(geometry, 0x9ad48f));
    lastStl = geometryToStl(geometry, { binary: true });
    $('download').disabled = false;

    log(
      `Remesh complete in ${ms} ms\n` +
      `watertight: ${stats.watertight}  (genus ${stats.genus})\n` +
      `triangles: ${stats.triangles}\n` +
      `volume: ${stats.volume.toFixed(1)}\n` +
      `voxel: ${stats.voxelSize.toFixed(3)}  dilate: ${stats.dilate}`,
    );
  } catch (err) {
    console.error(err);
    log(`Remesh failed: ${err.message}`);
  } finally {
    $('remesh').disabled = false;
  }
});

// --- Download ------------------------------------------------------------
$('download').addEventListener('click', () => {
  if (!lastStl) return;
  const blob = new Blob([lastStl.buffer ?? lastStl], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eq-character.stl';
  a.click();
  URL.revokeObjectURL(a.href);
});
