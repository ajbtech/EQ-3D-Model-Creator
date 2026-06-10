# EQ-3D-Model-Creator

Turn your EverQuest / Project 1999 character into a posed, **print-ready 3D model (STL)** — entirely
in your browser. You supply your own model (a glTF extracted from your client); this tool ships only
the engine + metadata. **No game art is hosted or uploaded anywhere.**

## Use it

1. Extract your character with [LanternExtractor](https://github.com/vermadas/LanternExtractor)
   (set `ModelExportFormat=2`, `ExportAllAnimationFrames=true`, `ExportGltfInGlbFormat=true`).
2. Open the app, upload your `.glb`, pick race/gender + a pose, generate, and download the STL.
3. Slice it (Cura / PrusaSlicer / Lychee) and print.

## Develop

```
npm install
npm run dev      # app dev server
npm run build    # production bundle -> dist/ (deployed to GitHub Pages)
npm test         # unit + integration tests (node --test)
npm run spike    # headless end-to-end pipeline check
```

The print-prep engine lives in `phase0/pipeline/` (pose → SDF remesh → watertight STL) and is shared
by the app, the tests, and the headless spike. See [`PLAN.md`](./PLAN.md) for the full design and
[`phase0/README.md`](./phase0/README.md) for how the pipeline was proven.

Unofficial fan project — EverQuest is a property of Daybreak Game Company. For personal use; do not
redistribute game art.
