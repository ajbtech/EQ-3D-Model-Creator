import * as THREE from 'three';

const ATTACHMENT_FLAG = 'isEquipmentAttachment';

// Pick the first candidate bone name that exists in the skeleton (case-insensitive),
// returning the skeleton's actual name. EQ rigs name the hand/off-hand bone
// differently across races, so the UI also offers a manual bone picker as a fallback
// (PLAN.md section 4, Phase 2B).
export function resolveBone(boneNames, candidates) {
  if (!boneNames || boneNames.length === 0) return null;
  const lower = boneNames.map((n) => n.toLowerCase());
  for (const c of candidates ?? []) {
    const i = lower.indexOf(String(c).toLowerCase());
    if (i !== -1) return boneNames[i];
  }
  return null;
}

// Find a bone (or any node) by name under a root.
function findBone(root, name) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

// Attach a piece of equipment (a loaded glTF scene) to a named bone with a tunable
// offset, so the existing pose -> bake -> remesh path fuses it into the figure.
// Reuses the fact that bakePose bakes EVERY mesh under the character root -- once
// the equipment is parented to a bone it poses and remeshes for free.
//
//   characterRoot : the loaded character (gltf.scene) with the skeleton.
//   equipmentRoot : the loaded weapon/shield (gltf.scene); cloned, not consumed.
//   boneName      : target bone (e.g. the right hand).
//   position      : [x,y,z] local offset on the bone.
//   rotationEuler : [x,y,z] radians.
//   scale         : uniform scale (number) or [x,y,z].
//
// Each attachment is tagged with a `slot` so several can coexist (weapon + shield
// + helm) while re-attaching one slot replaces only that slot -- the inventory
// auto-assembler attaches many at once, and the manual tuner re-attaches one live.
// `slot` defaults to 'default' (the single-attachment behaviour). Returns the holder.
export function attachEquipment(characterRoot, equipmentRoot, {
  boneName,
  slot = 'default',
  position = [0, 0, 0],
  rotationEuler = [0, 0, 0],
  scale = 1,
} = {}) {
  const bone = findBone(characterRoot, boneName);
  if (!bone) throw new Error(`attachEquipment: bone "${boneName}" not found in character`);

  // Replace only this slot's prior attachment so tuning doesn't stack copies.
  detachEquipment(characterRoot, slot);

  const holder = new THREE.Object3D();
  holder.name = `__equipment_${slot}__`;
  holder.userData[ATTACHMENT_FLAG] = true;
  holder.userData.equipmentSlot = slot;
  holder.position.fromArray(position);
  holder.rotation.set(rotationEuler[0], rotationEuler[1], rotationEuler[2]);
  if (Array.isArray(scale)) holder.scale.fromArray(scale);
  else holder.scale.setScalar(scale);

  holder.add(equipmentRoot.clone(true));
  bone.add(holder);
  return holder;
}

// Remove equipment attachments. With a `slot`, removes only that slot; otherwise
// removes every attachment.
export function detachEquipment(characterRoot, slot) {
  const toRemove = [];
  characterRoot.traverse((o) => {
    if (o.userData[ATTACHMENT_FLAG] && (slot === undefined || o.userData.equipmentSlot === slot)) {
      toRemove.push(o);
    }
  });
  for (const o of toRemove) o.parent?.remove(o);
}

// List the bone names under a character root (for the UI picker).
export function listBones(characterRoot) {
  const names = [];
  characterRoot.traverse((o) => {
    if (o.isBone) names.push(o.name);
  });
  return names;
}
