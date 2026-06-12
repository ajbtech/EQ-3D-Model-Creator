// Resolve parsed inventory items into concrete attachment specs.
//
// Combines the equipped visible items (from inventory.js), the item -> appearance
// table (`items.json`, keyed by item id -> { idfile, type }), and the slot ->
// bone table (`attachments.json`). Produces, per item, which attachment slot and
// bone candidates to use and which IT### appearance file to look for. Unknown items
// are returned as `matched: false` so the UI can show what could not be placed.
// (PLAN.md section 3.2 / section 7 table 5.)

// Map (inventory location, item type) -> attachment slot id.
function attachSlotFor(location, type) {
  if (location === 'Primary') return 'primary';
  if (location === 'Secondary') return type === 'shield' ? 'shield' : 'offhand';
  if (location === 'Head') return 'helm';
  if (location === 'Chest') return 'robe';
  return null;
}

export function resolveLoadout(equippedItems, itemsDb, attachmentsDb) {
  const slotDefs = new Map((attachmentsDb?.slots ?? []).map((s) => [s.id, s]));

  return equippedItems.map((item) => {
    const appearance = itemsDb?.[item.id] ?? itemsDb?.[String(item.id)];
    if (!appearance) {
      return { location: item.location, name: item.name, id: item.id, matched: false };
    }
    const attachSlot = attachSlotFor(item.location, appearance.type);
    const slotDef = attachSlot ? slotDefs.get(attachSlot) : null;
    return {
      location: item.location,
      name: item.name,
      id: item.id,
      idfile: appearance.idfile,
      type: appearance.type,
      attachSlot,
      boneCandidates: slotDef?.boneCandidates ?? [],
      defaultOffset: slotDef?.defaultOffset ?? null,
      matched: true,
    };
  });
}
