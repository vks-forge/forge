/**
 * Vite configuration for the Forge control room.
 *
 * Why: the app is a static bundle that talks to the Forge server only through `/api`, and in
 *   development that path is a proxy which adds the install token on the server side so the
 *   browser never sees it (vite.forge-proxy.ts). The `development` resolve condition makes
 *   workspace packages load from source, the same way vitest and `tsc -b` resolve them, so
 *   the app builds without building every package first. The build lands in `dist/web`
 *   because `dist/types` holds the type-check output of `tsc -b`.
 *
 * Exports: default export (Vite config).
 * Depends on: vite, @vitejs/plugin-react, @tailwindcss/vite, vite.forge-proxy.
 */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { forgeProxy } from './vite.forge-proxy.js';

const proxy = await forgeProxy();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ['development', 'module', 'browser'] },
  server: { host: '127.0.0.1', port: 5173, proxy },
  preview: { host: '127.0.0.1', port: 4173, proxy },
  build: { outDir: 'dist/web', sourcemap: true, target: 'es2023' },
});
