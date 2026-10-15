/**
 * Playwright global setup: a real Forge server, the built app, and a preview server wired to both.
 *
 * Why: the smoke runs against the real server API (d-0123). Playwright starts its own
 *   `webServer` before global setup, which is too early to know the server's port, so this file
 *   does the whole sequence in order: start Forge on a temporary data home and a free port and
 *   seed it (`helpers/real-forge.ts`), build the app, then run `vite preview` with `FORGE_HOME`
 *   and `FORGE_PORT` set so its `/api` proxy (vite.forge-proxy.ts) reaches that server and
 *   adds the install token itself. The page never holds the token. The returned teardown
 *   stops the preview server and Forge and deletes the temp folders. Needs `pnpm build` once
 *   first (the server and the proxy load `@forge/core` from `dist/`); allow about a minute.
 *
 * Exports: default async function (Playwright global setup).
 * Depends on: node:child_process, node:module, node:path, e2e/helpers/real-forge.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { startRealForge } from './helpers/real-forge.js';

const PREVIEW_PORT = 4173;
const APP_DIR = resolve(import.meta.dirname, '..');
const viteBin = join(
  dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin',
  'vite.js',
);

function runVite(args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [viteBin, ...args], {
    cwd: APP_DIR,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
}

function exitOf(child: ChildProcess): Promise<number | null> {
  return new Promise((done) => child.once('exit', (code) => done(code)));
}

async function waitForPreview(preview: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) {
      throw new Error('vite preview exited before it was ready.');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${PREVIEW_PORT}/`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error('vite preview did not answer in 60 s.');
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const forge = await startRealForge();
  const env = {
    ...process.env,
    FORGE_HOME: forge.home,
    FORGE_PORT: String(forge.port),
  };

  try {
    const built = await exitOf(runVite(['build'], env));
    if (built !== 0) {
      throw new Error(`vite build failed (exit ${built}).`);
    }

    const preview = runVite(
      ['preview', '--port', String(PREVIEW_PORT), '--strictPort'],
      env,
    );

    try {
      await waitForPreview(preview);
    } catch (error) {
      preview.kill();
      throw error;
    }

    return async () => {
      preview.kill();
      await forge.stop();
    };
  } catch (error) {
    await forge.stop();
    throw error;
  }
}
