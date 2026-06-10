# Phase 0 — Pipeline spike

Goal (from [`PLAN.md`](../PLAN.md) Phase 0): prove the whole print-prep **spine** on one
character holding one weapon, before building any UI —

> pose → bake skinned mesh → watertight voxel/SDF remesh → STL

using the stack the plan settled on: **`three-mesh-bvh`** (signed-distance sampling) +
**`manifold-3d` `LevelSet`** (guaranteed-watertight surface extraction).

## What is proven (and independently verified)

`npm run spike` runs the full spine headless on a **synthetic** skinned figure with a
deliberately **thin (0.05u) bone-attached blade** — shaped to stress the same hard cases a real
extracted EQ glTF will (skinned deformation + a thin, separate weapon that must survive remesh
and fuse to the body). **No EverQuest art is used or shipped** (PLAN.md §0.1, §9).

For two poses (`standing`, `waving`) the spike asserts, and an independent edge-parity check
confirms:

- **watertight**: every edge shared by exactly 2 triangles (0 open, 0 non-manifold edges);
- **genus 0**, positive volume, non-empty;
- **body + blade fuse into a single connected component**;
- **posing is real**: the bend moves the bbox width by ~8.7u (not a no-op bake);
- valid binary **STL** written to `phase0/out/`.

```
npm install
npm run spike
```

> Why synthetic? We cannot legally obtain or redistribute the game client's `.s3d`/glTF art in
> this environment. The pipeline is **loader-agnostic** — it consumes a `{ root, animations }`
> shaped like a loaded glTF — so the exact same code path runs on a real LanternExtractor glTF.

## Validated on real extracted art

`npm run spike` proves the spine synthetically; `validate-glb.js` proves it on a **real
LanternExtractor export** (the `.glb` stays local -- it is the user's own EQ art, never committed):

```
node phase0/validate-glb.js <path-to.glb> [clipName] [time]
```

Result on a real Human Male (`HUM`) export: **13 skinned meshes, 25 bones, 70 named animation
clips** (Stand, Wave, Salute, Bow, Combat 1H Slash, Cast Push Forward, ...) loaded and posed,
then remeshed to a **single-component, watertight** STL. Two findings carried forward:

- **Inside/outside must use a winding test, not parity.** A real model is ~13 interpenetrating
  closed parts; plain crossing-parity computes their *symmetric difference* (a point inside two
  overlapping parts reads "outside"), carving spurious tunnels. Summing signed crossings gives the
  *union* -- the fused figure we want. (See `sdf.js`.)
- **A small auto-dilation (~1.5 voxels) fuses the separate parts** into one connected solid. Any
  remaining genus is anatomical (the arm-to-torso / leg gaps), which we keep on purpose.

## Browser viewer (for your real glTF)

`phase0/web/` is the interactive Phase 0 viewer: upload a `.glb` extracted with
**LanternExtractor**, pick a clip + frame, preview the posed mesh, remesh to watertight, and
download the STL. It reuses the **same** `phase0/pipeline/*` modules as the verified spike.

```
npm run serve     # then open http://localhost:5173
```

Status: the **headless pipeline is fully verified**; the browser UI depends on WebGL + CDN-served
WASM and should be opened in a real browser to confirm against an actual glTF — that is the
natural next step once you have a LanternExtractor export.

## Layout

```
phase0/
  pipeline/
    pose.js        bake an animation frame (skinned body + bone-attached gear) -> static geometry
    sdf.js         signed-distance sampler over an arbitrary/open mesh (three-mesh-bvh)
    remesh.js      SDF -> manifold-3d LevelSet -> watertight geometry + stats
    merge.js       index-agnostic geometry concatenation
    exportStl.js   geometry -> binary STL
    index.js       runPipeline() orchestrator + re-exports
  fixtures/
    makeSyntheticRig.js   the synthetic skinned figure + thin blade (test jig, not EQ art)
  web/             browser viewer (index.html + app.js)
  run-spike.js     headless end-to-end spike with assertions (synthetic rig)
  validate-glb.js  end-to-end validation against a real extracted .glb
  strip-textures.js  Node helper: drop textures from a GLB so it parses without a DOM
  render-stl.js    dependency-free software renderer: STL -> PNG (multi-angle preview)
  serve.js         tiny static server for the viewer
```

## Knobs that matter (carried into later phases)

- **`voxelSize`** — remesh grid resolution. Smaller = more detail, slower. Default ≈ longest
  axis / 128.
- **`dilate`** — grows the solid outward before extraction; closes thin gaps and enforces a
  minimum printable wall on blades/capes (PLAN.md §6.5). The blade only survives reliably with a
  little dilation — exactly the thin-feature finding Phase 0 was meant to surface.
