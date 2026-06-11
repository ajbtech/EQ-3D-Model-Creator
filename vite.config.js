import { defineConfig } from 'vite';

// The app lives in app/ and imports the shared engine from phase0/pipeline/.
// manifold-3d locates its WASM via `new URL('manifold.wasm', import.meta.url)`,
// which Vite emits as an asset automatically -- no extra plugin needed.
export default defineConfig({
  root: 'app',
  // Project Pages serves under /<repo>/, so assets must be referenced from there.
  base: '/EQ-3D-Model-Creator/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    fs: {
      // allow importing the engine from outside app/ (../phase0/pipeline)
      allow: ['..'],
    },
  },
  // Keep manifold-3d out of dep pre-bundling so its import.meta.url WASM lookup
  // is preserved for Vite's asset handling.
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
});
