# Guided P99 Character Assembler — Build Plan

A hosted, client-side website that turns an EverQuest (Project 1999) character into a
posed, print-ready 3D model (STL). Users either upload their `/outputfile inventory`
dump or manually pick race / gender / class / equipment, choose a pose, preview in 3D,
and download a watertight STL for printing.

---

## Resolved design decisions (v2 — after design review)

These supersede the original text where they conflict; the body below has been updated to match.

1. **Print-prep is a client-side voxel/SDF remesh, not a boolean union.** EQ game meshes are
   open sheets (hollow bodies, zero-thickness blades/capes), so `manifold-3d`'s union can't be
   the workhorse — it only guarantees watertightness when each sub-part is *already* a closed
   solid. A volumetric remesh (Section 6.3) is the **primary** path; `manifold-3d` is demoted to
   a helper for fusing parts that are already solid.
2. **Strictly static — no backend, ever.** Serverless Blender (old Section 6.4-B) is **rejected**.
   When WASM remesh can't close a mesh, the fallback is a **downloadable companion / documented
   Blender recipe the user runs locally** (old 6.4-C). This preserves the "ships nothing, touches
   nothing" legal/hosting posture that makes broad distribution safe.
3. **Phase 0 includes one held weapon.** A naked low-poly human is the *easiest* remesh case; the
   spike must also prove the hard case (thin blade + hand attachment) before any UI is built.
4. **Target broad P99 adoption from the start.** Consequence: the glTF-upload step is the single
   biggest adoption barrier, and with a server off the table, the **WASM S3D extractor** (formerly
   a Phase 4 stretch) is pulled earlier. Until it lands, the **manual pickers** (no upload at all)
   are the low-friction on-ramp for casual users.

> Net standing risk: "broad audience + strictly client-side" front-loads our two hardest chunks
> (WASM voxel remesh and WASM S3D extraction). Both are now near-term bets — see Section 11.

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

### 0.2 Strictly static, client-side site — no backend, ever
- Assembly, posing, live 3D preview, STL export, **and print-prep** all run **client-side**
  (three.js + WASM).
- The hardest step is turning a hollow game mesh into a watertight printable solid. We do this
  with an **in-browser WASM voxel/SDF remesh** (Section 6). When that can't close a particular
  mesh, the fallback is a **downloadable companion tool / documented Blender recipe the user
  runs locally** — never a server.

Net result: hostable on GitHub Pages, **no backend** (a serverless step is explicitly rejected),
no hosting cost, no IP exposure — same shape as the XP Calculator.

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

### 2.2 Classic models only
- **Classic ("old") models**: very low-poly, blocky — the look most P99 players identify
  with. Easier to clean up. Downside: armor is almost entirely *texture*, not geometry, so a
  single-color print is a smooth body with detail only in the (lost) texture.

We support classic models **only** — they are "the P99 look" and the lower poly count remeshes
more cleanly. Luclin ("new") models are explicitly out of scope. This means equipment contributes
relatively little geometry (Section 4), which is a known, accepted tradeoff (Section 11).

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

### 6.4 Where to run it — decided: client-side WASM, with a local companion fallback

**Concrete remesh stack (resolved by research spike):**
1. **`three-mesh-bvh`** samples a **signed distance field** from the assembled + posed mesh,
   however open/non-manifold it is. It builds a BVH and uses `bvhClosestPointToPoint()` for the
   distance plus a ray test for inside/outside; there is a working "Fast SDF Generation" example,
   and it can run on the GPU. This is the step that tolerates EQ's open sheets and gaps.
2. **`manifold-3d`'s `LevelSet`** consumes that SDF (an SDF callback + bounding box + voxel edge
   length) and extracts a **guaranteed watertight, manifold** surface — their docs note it
   improves on plain Marching Cubes. So `manifold-3d` *is* in the primary path, but as the
   **SDF→surface extractor**, not as a boolean-union repair tool. (Its `union`/`Merge` remain
   useful only for sub-parts that are already closed solids.)

> Dead end ruled out: the `mjurczyk/openvdb` JS port is read-only / visualization-oriented
> (closer to NanoVDB) and is **not** a remesh tool — do not plan around an "OpenVDB WASM port."

- **A. Pure client-side WASM voxel/SDF remesh — PRIMARY.** The `three-mesh-bvh` (SDF) +
  `manifold-3d` `LevelSet` stack above repairs arbitrary open meshes and guarantees a watertight
  result, fully in-browser. Keeps the site fully static; the main remaining risk is
  performance/quality at higher voxel resolution — note `manifold-3d`'s WASM build runs serially
  (no TBB threads), while the SDF sampling can be GPU-accelerated (Section 11).
- **C. Downloadable companion — FALLBACK.** When the WASM remesh can't close a mesh, the site
  emits an assembled glTF and a small local tool (or a documented Blender Voxel-Remesh +
  3D-Print-Toolbox recipe) does the remesh. Most robust, least seamless — but still no server.
- **B. Serverless Blender — REJECTED.** A function running headless Blender would be the most
  reliable workhorse, but it is a backend and breaks the "strictly static, ships/touches
  nothing" posture (Section 0.2, Section 9). Not pursued.

**Recommendation:** ship **A** (WASM voxel remesh) as the default; offer **C** as the documented
escape hatch for meshes it can't close. Improve WASM resolution/quality over time so **C** is
needed less and less.

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
- **`three-mesh-bvh`** — samples a signed distance field from the assembled/posed mesh (BVH
  closest-point + inside/outside ray test; GPU-capable). First half of the **primary** print-prep.
- **`manifold-3d` (WASM)** — `LevelSet` extracts a guaranteed-watertight manifold surface from
  that SDF (second half of primary print-prep); its `union`/`Merge` are a secondary helper for
  already-solid sub-parts. Note: WASM build runs serially (no TBB).
- **LanternExtractor** — user-run, off-site, to produce glTF (MVP onramp); replaced by a WASM
  S3D parser for drag-and-drop (Phase 3.5).
- **Downloadable companion / documented Blender recipe** — local fallback when WASM remesh can't
  close a mesh. No serverless component (explicitly rejected, Section 6.4-B).

---

## 9. Legal posture
Same as your other projects: ship **no** EQ art; the user supplies their own from their client;
personal-use printing; MIT-licensed code; clear "unofficial fan project — EverQuest is property
of Daybreak" disclaimer. Don't host generated character STLs. Factual metadata is fine. Don't
enable selling prints.

---

## 10. Phased roadmap

### Phase 0 — Spike (de-risk before any UI)  ← START HERE
Prove the whole pipeline on **one** character **holding one weapon** by hand:
1. Extract one Human Male **+ one weapon** (e.g. a 1H sword) with LanternExtractor -> glTF.
2. Load in three.js; confirm skeleton + animations are present.
3. Pose at one chosen frame; bake the skinned mesh. **Attach the weapon to the hand bone** so the
   spike includes the hard case: thin blade geometry + attachment, not just a smooth body.
4. Remesh to watertight via the **WASM voxel/SDF remesh** (validate it can close the thin blade);
   keep a Blender voxel-remesh run as a cross-check baseline.
5. Export STL; open in a slicer (and ideally print one) to confirm it's actually printable.

If Phase 0 works end-to-end **with the weapon**, the rest is UI + data. If the WASM remesh can't
close the thin blade at a reasonable resolution, you've learned the real constraint (and whether
the companion fallback is mandatory) before building anything.

### Phase 1 — MVP
Manual race/gender select, upload pre-extracted glTF, 5 poses, body **+ a single held weapon**
(the weapon path is already proven in Phase 0; full per-slot equipment is deferred to Phase 2),
voxel remesh, STL download, live preview.

### Phase 2 — Equipment + scale
Per-slot equipment pickers; attach weapons/shields/robes/helms via the bone+transform table;
scale normalization + base; build out tables 2 & 4.

### Phase 3 — Inventory import
`/outputfile inventory` parsing + the item->appearance DB; auto-build from a real character.

### Phase 3.5 — In-browser S3D extraction (pulled forward for broad adoption)
WASM port of LanternExtractor logic so the user can drag-and-drop their `.s3d` archives instead
of running an external tool first. This is the single biggest adoption lever (the glTF-upload
step is the main barrier) and, with no server allowed, the only way to make onboarding seamless.
Until it lands, the **manual pickers** remain the zero-upload on-ramp for casual users.

### Phase 4 — Stretch
Multi-part/multi-color export and paint-guide output; richer pose library.

---

## 11. Biggest risks / honest unknowns
- **In-browser S3D parsing** — now a near-term commitment (Phase 3.5), not a stretch, because
  broad adoption + no-server means drag-and-drop is the only seamless onramp. Mitigated by the
  LanternExtractor-first MVP and the manual pickers as a zero-upload fallback. This is one of the
  two big front-loaded WASM bets.
- **WASM remesh performance/quality** at higher resolution — the *library* question is now
  resolved (`three-mesh-bvh` SDF + `manifold-3d` `LevelSet`, §6.4), so this is no longer an
  open-ended "does a tool exist" bet. What remains is whether that stack hits acceptable quality
  on **thin geometry** (weapon blades) and acceptable speed at figurine-useful voxel resolution —
  bounded by `manifold-3d`'s serial WASM build. Fallback is the **local companion / documented
  Blender recipe** (serverless is rejected). Phase 0's weapon spike is the direct test of both.
- **Weapon attachment orientation** — fiddly per weapon type; expect manual tuning.
- **Classic armor is texture-only** — "armor" barely shows in single-color geometry; set
  expectations up front. Since Luclin models are out of scope, this is a permanent, accepted
  tradeoff rather than something a future model toggle will fix.
- **Pose frame selection** is manual curation, not automatic.
- **Action-pose printability** (overhangs, balance) — always add a base; warn on casting/attack.
- **Real-world printability is unverified (open since Phase 0).** Phase 0 confirmed watertight +
  manifold + genus-0 *automatically*, and the browser viewer was smoke-tested on a real `.glb`,
  but **no STL has been physically sliced or printed**. Slicer behaviour, minimum wall thickness at
  figurine scale, supports, and stand-up stability are still unconfirmed. Get a real print done as
  early in Phase 1 as possible to close this.

---

## 12. First concrete step
Do **Phase 0** with: LanternExtractor (glTF export) -> three.js (load + pose at one frame) ->
`manifold-3d` union (or Blender voxel remesh) -> `STLExporter` -> slice in PrusaSlicer/Lychee.
One human, one pose, one printable STL. Everything else builds on that proven spine.
