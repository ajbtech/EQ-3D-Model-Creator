# Guided P99 Character Assembler — Build Plan

A hosted, client-side website that turns an EverQuest (Project 1999) character into a
posed, print-ready 3D model (STL). Users either upload their `/outputfile inventory`
dump or manually pick race / gender / class / equipment, choose a pose, preview in 3D,
and download a watertight STL for printing.

---

## 0. Two decisions that shape the whole project

### 0.1 Ship no art — ship a metadata database + an engine
An EQ character is **not** a stored mesh. It is a *recipe*:

- a base **race + gender** mesh (e.g. `HUM` Human Male, `HUF` Human Female),
- a **skeleton** + named animation clips,
- **textures** (face/body — and in classic EQ, most armor is texture-only),
- a few **separate equipment meshes** (held weapons, shields, robes, some helms).

The meshes/textures live inside the user's own client (`.s3d` archives). If we host them,
we are (a) redistributing Daybreak's copyrighted 3D art and (b) signing up to maintain a
3D-asset library — the part we want to avoid.

**Therefore: the user supplies the art from their own install; we ship only the engine and
a *metadata* database.** This mirrors the Travel Map (reads the user's own logs, ships
nothing copyrighted). The "database" we maintain is factual lookup data — like ZEMs and
hell levels — not art.

### 0.2 Static, client-side site — with one caveat
- Assembly, posing, live 3D preview, and STL export run fully **client-side** (three.js).
- The **one** step that strains pure-static is turning a hollow game mesh into a watertight
  printable solid. That is most reliable in headless Blender. Plan: do it in-browser via
  WASM where we can, and keep a documented Blender fallback (see Section 6).

Net result: hostable on GitHub Pages, no backend, no hosting cost, no IP exposure — same
shape as the XP Calculator.

---

## 1. Architecture overview

```
                         (user's own EQ/P99 client)
                                   |
                     extract .s3d --> meshes + skeleton + textures
                                   |
   [Input]                        v                    [We ship]
  manual pickers  ----+      glTF / OBJ            metadata DB (JSON):
  /outputfile inv ----+----> + textures    +       - race/gender -> model code
                      |          |                  - item -> appearance
                 recipe (race,   v                  - pose -> clip + frame
                 gender, slots,  Assembly engine    - slot -> bone + transform
                 pose)           (three.js)         - race -> print scale/height
                      |          |
                      v          v
                 Posing (bake skeleton at chosen frame)
                      |
                      v
                 Print-prep (watertight solid, scale, base)  <-- WASM or Blender
                      |
                      v
                 STL / 3MF download   +   live 3D preview throughout
```

Two databases we own, both **metadata only** (no art):
1. **Recipe metadata** — how to map a character into model codes + equipment looks.
2. **Build metadata** — bone attachments, pose frames, scale normalization.

---

## 2. The asset pipeline (the unfamiliar part #1)

### 2.1 What's inside the client
EQ stores art in `.s3d` archives. Each contains `.wld` files (models, skeletons,
animations) plus textures. Player race/gender models each come from their own source file
(e.g. `globalhuf_chr.s3d`), with defined texture/head/face/hair/beard variation ranges.

### 2.2 Classic vs Luclin models — pick classic by default
- **Classic ("old") models**: very low-poly, blocky — the look most P99 players identify
  with. Easier to clean up. Downside: armor is almost entirely *texture*, not geometry, so a
  single-color print is a smooth body with detail only in the (lost) texture.
- **Luclin ("new") models**: higher-poly, more separate equipment geometry, more print
  detail — but not "the P99 look" to most players.

Default to classic; expose a toggle for Luclin later. This choice affects how much geometry
equipment contributes (Section 4).

### 2.3 Getting meshes into the browser — two routes
- **MVP route (do this first):** the user runs **LanternExtractor** (open-source, built for
  the Velious-era "Trilogy" client P99 uses; exports **glTF** with textured mesh + skeleton +
  animations). They upload/point the site at the resulting glTF. *Zero parsing work for us.*
- **Later route (stretch):** port S3D/WLD parsing to JS/WASM so it becomes pure drag-and-drop
  like the Travel Map. This is the single biggest engineering chunk; defer it.

> The glTF route is why posing works for free: glTF carries the skeleton and the named EQ
> animation clips, so we can pose without rebuilding rigs.

---

## 3. Input modes

### 3.1 Manual
Pickers for: **race**, **gender**, **class** (drives sensible default gear flavor only),
then per-visible-slot **equipment look** selectors. Keep it to looks, not exact items, in v1
(e.g. "1H sword", "kite shield", "plate body", "wizard robe", "full helm").

### 3.2 `/outputfile inventory`
In-game `/outputfile inventory` writes a tab-delimited text file with columns roughly
`Location  Name  ID  Count  Slots`. Equipped items have Location = a slot name
(`Head`, `Chest`, `Primary`, `Secondary`, `Hands`, `Legs`, `Feet`, ...); bag/bank contents
use `General#`/`Bank#` and are ignored.

Parsing:
1. Keep rows whose Location is a **visible** equipment slot.
2. Map each item ID/name -> appearance via the **item->appearance** metadata table
   (weapon model code, shield, robe texture, body-armor texture material).
3. Emit the same recipe object the manual flow produces.

**Only some slots affect the visible model.** Visible: Primary (held), Secondary
(shield/held), Head (helm graphic), Chest (robe + body texture), and the armor slots set the
body *texture* pattern. Rings/ears/charms etc. are invisible — skip them.

---

## 4. Assembly engine (three.js)

1. Load the base race/gender mesh from the user's glTF; apply the body texture for the
   recipe's armor look.
2. Attach equipment meshes to bones using the **slot->bone + transform** table:
   - Primary weapon -> right-hand bone, with a per-weapon-type orientation offset.
   - Shield/secondary -> left-hand/forearm bone.
   - Robe/helm -> torso/head as separate meshes (classic robes/helms are real geometry).
   - *Weapon orientation is fiddly* — it's a known pain point (how a held model is rotated
     relative to the hand bone). Build a small offset table per weapon class and tune
     visually; this is build metadata you own.
3. Render a live, orbitable 3D preview. This is a big, cheap UX win in three.js and lets
   users sanity-check before printing.

---

## 5. Posing

EQ animations follow a prefix scheme (locomotion `L##`, combat `C##`, damage `D##`, social/
emote `T##`, spellcast `S##`, passive/idle `P##`). The exact clip+frame for each pose is
**curated build metadata** — pick the frame that reads best as a frozen figurine and validate
visually. Target mapping:

| Pose UI label | Animation family | Notes |
|---|---|---|
| Standing | idle / passive | the safe default; most printable (compact, balanced) |
| Waving | social/emote | one arm raised -> overhang + balance considerations |
| Saluting | social/emote | arm to head; check the hand doesn't fuse to the face on remesh |
| Attacking | combat | weapon extended -> long overhang, thin blade, needs base |
| Casting | spellcast | arms out -> overhangs; dramatic but hardest to print |

Mechanic: load the clip, **evaluate the skeleton at the chosen frame**, bake the linear-blend
skinning into a static deformed mesh, and feed *that* posed mesh to print-prep.

**Printability is pose-dependent** — see Section 6. Action poses create overhangs, thin
connections, and tip-over risk; they essentially require an added base.

---

## 6. Print-prep engine (the unfamiliar part #2 — read this twice)

### 6.1 The goal
Produce **one watertight (manifold) closed solid**, correctly scaled, stable enough to stand,
with no sub-printable-thin features.

### 6.2 Why a raw game mesh won't print
Game meshes are display surfaces, not solids: open holes, zero-thickness sheets (capes, blades),
intersecting separate parts, non-manifold edges, and inverted/inconsistent normals. A slicer
can't tell inside from outside, so it fails or prints garbage.

### 6.3 The robust strategy: volumetric remesh ("shrink-wrap")
Rather than hand-closing every hole per model, convert the assembled+posed parts into a
**volume** (signed distance field / voxel grid) and re-extract a single closed surface
(marching cubes). This:
- automatically **fuses** all parts (body + weapon + shield + robe) into one solid,
- **guarantees** a watertight, manifold result,
- works *especially* well on low-poly classic EQ models.

Trade-offs: detail softens at low voxel resolution (fine for figurine scale), and parts that
merely touch get fused (usually desirable here).

### 6.4 Where to run it — three options
- **A. Pure client-side (WASM).** `manifold-3d` (WASM) does boolean **union** and guarantees
  manifold output — ideal *if* each sub-part is itself a closed solid. For repairing
  arbitrary open/non-manifold meshes, you need a true voxel/SDF remesh (heavier WASM, e.g. an
  OpenVDB port or a marching-cubes-over-SDF you control). Keeps the site fully static; riskiest
  on performance/quality at higher resolutions.
- **B. Tiny serverless step.** One function runs headless Blender's **Voxel Remesh** +
  **3D-Print-Toolbox** (the reliable workhorse) and returns the STL. Breaks "pure static" but
  only for this one call; modest hosting.
- **C. Downloadable companion.** Site emits an assembled glTF; a small local tool (or a
  documented Blender recipe) does the remesh. Most robust, least seamless.

**Recommendation:** start with **A** for solid sub-parts via `manifold-3d` union; if a result
isn't watertight, fall back to a **documented Blender voxel-remesh recipe** (B/C). Move toward
fully-automatic as confidence grows.

### 6.5 After remesh
- Optional **smoothing** + **decimation** (lower triangle count for slicers).
- **Thicken** anything still sub-minimum (weapon edges, capes): ~0.8–1.5 mm walls for FDM,
  ~0.3–0.5 mm for resin. Voxel remesh fixes most of this automatically.
- **Scale normalization.** EQ units are arbitrary and rips routinely "need scaling." Define a
  target figurine height per race (e.g. 32 mm tabletop human; scale Ogres up / Gnomes down by
  lore height ratios). This is metadata you own.
- **Stability / base.** Add a plinth and ensure the center of mass sits over the footprint —
  essential for waving/attacking/casting poses.
- **Orientation.** Pre-orient sensibly (we don't slice, but a good default + base helps).
- **Export** STL (offer 3MF too).

### 6.6 What we explicitly do NOT do
- **Support generation + slicing** happen in the user's slicer (Cura / PrusaSlicer / Lychee).
- **Color**: single-material unless the user hand-paints or runs a multi-material printer.
  Resin is recommended for figurine detail; FDM for larger/cheaper prints.
- Ship a short "how to print this STL" handoff page (scale check, supports, material).

---

## 7. The metadata you maintain (your strength — treat it like the ZEM tables)

Versioned JSON, each with an explicit "sources & assumptions" note like the XP Calc README:

1. **race+gender -> model code + source file** (e.g. EQEmu race-inventory data).
2. **race -> target print height / scale factor.**
3. **pose -> animation clip + frame**, per skeleton type.
4. **equipment slot -> attachment bone + transform** (the weapon-orientation table).
5. **item ID/name -> appearance** (weapon model code, shield, robe, body texture material);
   sources: P99 wiki / EQEmu item data.
6. **visible-slot list** (which inventory slots change the model).

---

## 8. Tech stack
- **Static site** on GitHub Pages; vanilla JS or a light framework (match the XP Calc).
- **three.js** — glTF load, assembly, posing, preview, `STLExporter`.
- **manifold-3d (WASM)** — boolean union / manifold guarantee.
- **LanternExtractor** — user-run, off-site, to produce glTF (MVP).
- Optional later: one serverless function (Blender headless) for bulletproof remesh; WASM
  S3D parser for drag-and-drop.

---

## 9. Legal posture
Same as your other projects: ship **no** EQ art; the user supplies their own from their client;
personal-use printing; MIT-licensed code; clear "unofficial fan project — EverQuest is property
of Daybreak" disclaimer. Don't host generated character STLs. Factual metadata is fine. Don't
enable selling prints.

---

## 10. Phased roadmap

### Phase 0 — Spike (de-risk before any UI)  ← START HERE
Prove the whole pipeline on **one** character by hand:
1. Extract one Human Male with LanternExtractor -> glTF.
2. Load in three.js; confirm skeleton + animations are present.
3. Pose at one chosen frame; bake the skinned mesh.
4. Remesh to watertight via `manifold-3d` (and/or Blender voxel remesh).
5. Export STL; open in a slicer (and ideally print one) to confirm it's actually printable.

If Phase 0 works end-to-end, the rest is UI + data. If it doesn't, you've learned the real
constraints before building anything.

### Phase 1 — MVP
Manual race/gender select, upload pre-extracted glTF, 5 poses, basic body (no equipment yet),
voxel/union remesh, STL download, live preview.

### Phase 2 — Equipment + scale
Per-slot equipment pickers; attach weapons/shields/robes/helms via the bone+transform table;
scale normalization + base; build out tables 2 & 4.

### Phase 3 — Inventory import
`/outputfile inventory` parsing + the item->appearance DB; auto-build from a real character.

### Phase 4 — Stretch
In-browser S3D extraction (WASM port of LanternExtractor logic) for pure drag-and-drop;
multi-part/multi-color export and paint-guide output; Luclin-model support.

---

## 11. Biggest risks / honest unknowns
- **In-browser S3D parsing** (only if you pursue full client-side extraction) — mitigated by
  the LanternExtractor-first MVP.
- **WASM remesh performance/quality** at higher resolution — fallback to Blender (serverless
  or companion).
- **Weapon attachment orientation** — fiddly per weapon type; expect manual tuning.
- **Classic armor is texture-only** — "armor" barely shows in single-color geometry; set
  expectations up front (or offer Luclin for more detail).
- **Pose frame selection** is manual curation, not automatic.
- **Action-pose printability** (overhangs, balance) — always add a base; warn on casting/attack.

---

## 12. First concrete step
Do **Phase 0** with: LanternExtractor (glTF export) -> three.js (load + pose at one frame) ->
`manifold-3d` union (or Blender voxel remesh) -> `STLExporter` -> slice in PrusaSlicer/Lychee.
One human, one pose, one printable STL. Everything else builds on that proven spine.
