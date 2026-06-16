import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// A small orbitable three.js viewer. Ported from the Phase 0 viewer
// (phase0/web/app.js) and wrapped as a reusable module.
export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

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
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
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

  let displayObject = null;
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

  function show(object3d) {
    if (displayObject) scene.remove(displayObject);
    displayObject = object3d;
    scene.add(object3d);
    frameCameraTo(object3d);
  }

  function showGeometry(geometry, color = 0x9db4cf) {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }),
    );
    show(mesh);
  }

  // Show several parts together (multi-part export preview), each tinted so the body,
  // base and equipment read as the separate pieces they will print as.
  const PART_COLORS = [0x9ad48f, 0xb0853e, 0xd47f9a, 0x7fa7d4, 0xd4c97f];
  function showParts(parts) {
    const group = new THREE.Group();
    parts.forEach((part, i) => {
      const color = part.color ?? PART_COLORS[i % PART_COLORS.length];
      group.add(new THREE.Mesh(
        part.geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }),
      ));
    });
    show(group);
  }

  return { show, showGeometry, showParts, resize };
}
