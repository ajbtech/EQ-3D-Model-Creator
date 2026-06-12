// Parse an EQ `/outputfile inventory` dump and pick out the equipped, visible items.
//
// The dump is tab-delimited with a header row `Location  Name  ID  Count  Slots`.
// Equipped items use a slot name as their Location (Head, Chest, Primary, ...);
// bag/bank contents use `General#` / `Bank#` and are ignored (PLAN.md section 3.2).

// Visible equip slots whose item shows as GEOMETRY on a classic model: the held
// weapon/shield plus (where they are real geometry) the helm and robe. Maps the
// dump's Location -> our internal slot id.
const VISIBLE_SLOTS = {
  Primary: 'primary',
  Secondary: 'secondary',
  Head: 'head',
  Chest: 'chest',
};

export function parseInventory(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const location = cols[0]?.trim();
    if (!location || location === 'Location') continue; // skip header / blank
    rows.push({
      location,
      name: (cols[1] ?? '').trim(),
      id: Number(cols[2]) || 0,
      count: Number(cols[3]) || 0,
    });
  }
  return rows;
}

// Keep only filled, visible equipment slots; attach an internal `slot` id.
export function equippedVisibleItems(rows) {
  return rows
    .filter((r) => VISIBLE_SLOTS[r.location] && r.name && r.name !== 'Empty' && r.id > 0)
    .map((r) => ({ slot: VISIBLE_SLOTS[r.location], location: r.location, name: r.name, id: r.id }));
}
