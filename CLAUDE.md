# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## What this is

A hosted, **client-side** tool that turns an EverQuest / Project 1999 character into a posed,
print-ready 3D model (STL). The user supplies their own art (a glTF extracted from their client);
we ship only the engine + metadata. See [`PLAN.md`](./PLAN.md) for the full design and roadmap, and
[`phase0/README.md`](./phase0/README.md) for the proven print-prep pipeline.

## Commands

```
npm install      # install deps (three, three-mesh-bvh, manifold-3d; vite for the app)
npm run dev      # Vite dev server for the app/ MVP (guided pickers + poses + STL)
npm run build    # production bundle -> dist/ (what GitHub Pages serves)
npm run preview  # serve the built dist/ locally
npm test         # run the unit + integration test suite (node --test)
npm run spike    # headless end-to-end pipeline spike on a synthetic rig (asserts; exits non-zero on failure)
npm run serve    # serve the legacy Phase 0 viewer at http://localhost:5173
```

## Development workflow — use TDD

**Write tests first.** For any new behaviour or bug fix, follow test-driven development:

1. **Red** — write a failing test in `test/` (named `*.test.js`) that captures the desired
   behaviour or reproduces the bug. Run `npm test` and watch it fail for the expected reason.
2. **Green** — write the minimum code to make the test pass.
3. **Refactor** — clean up with the test as your safety net.

If a change cannot reasonably be driven by a test (e.g. a pure asset/config edit), say so
explicitly rather than skipping tests silently. Bugs we have already hit — the SDF winding-vs-parity
sign error and the animation loop-wrap — are exactly the kind a test pins down; new pipeline logic
must ship with tests. Keep `npm test` green; CI (`.github/workflows/ci.yml`) runs it on every PR.

## Hard constraints

- **Ship no EverQuest art.** Never commit `.s3d` / `.gltf` / `.glb` game assets or STLs generated
  from them. The user supplies their own; inputs and `phase0/out/` are gitignored.
- **Strictly client-side, no backend.** Print-prep runs in-browser (three.js + WASM). No servers /
  serverless steps (see PLAN.md §0.2).
- The pipeline is **loader-agnostic**: it consumes a `{ root, animations }` shape (like a loaded
  glTF), so the same code runs headless (tests/spike) and in the browser viewer.

## Layout

- `phase0/pipeline/` — the engine (shared by app, tests, spike): `pose` → `sdf` → `remesh` →
  `exportStl`, with `merge`, `scale` (figurine height), `poses` (curated-pose resolution), `index`.
- `phase0/fixtures/` — synthetic test rig (a jig, not EQ art).
- `phase0/web/` — legacy Phase 0 viewer (kept for reference).
- `app/` — the Phase 1 MVP web app (Vite root): `src/` (UI) + `data/` (poses/races metadata JSON).
- `test/` — `node --test` unit + integration tests.
- `vite.config.js` — `root: app/`, `base: /EQ-3D-Model-Creator/` for GitHub Pages.
