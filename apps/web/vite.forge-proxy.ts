/**
 * Dev-server proxy that lets the browser talk to the Forge server without ever holding its token.
 *
 * Why: the Forge server only answers requests that carry the install token, and that token is
 *   the keys to the machine (it can start Workers). The control room runs in a browser tab, so
 *   anything it can read, a page script or an extension can read too. In development the Vite
 *   server stands in the middle: the page calls `/api/*` with no credentials, and this proxy
 *   strips any `Authorization` header the page sent, reads the token file the server wrote in
 *   the data home, and adds the real header on the way to `127.0.0.1`. The file is read on
 *   every request because the server regenerates the token on restart; a stale cached token
 *   would turn into a wall of 401s. The token is never logged, never put in `define` or
 *   `import.meta.env`, and never leaves this process except in that one outgoing header.
 *
 * Exports: readInstallToken(), forgeProxy(), InstallTokenSource.
 * Depends on: node:fs, node:os, @forge/core (data home rules, loaded lazily so a missing build
 *   fails with a clear message instead of breaking `vite build`). IO: reads the token file.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type { ProxyOptions } from 'vite';

/** Where the token lives: injectable so tests never touch the real data home. */
export interface InstallTokenSource {
  readonly tokenPath: () => string;
  readonly readText: (path: string) => string | undefined;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_PORT = '4310';

const readIfPresent = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
};

/** The token in the file, or undefined when it is absent or malformed. Never throws on a bad file. */
export function readInstallToken(source: InstallTokenSource): string | undefined {
  try {
    const text = source.readText(source.tokenPath())?.trim();

    return text !== undefined && TOKEN.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

/** The data home rule of the server and the CLI (`FORGE_HOME`, bootstrap file, platform default). */
async function dataHomeTokenPath(): Promise<() => string> {
  const core = await import('@forge/core');
  const platform = process.platform;
  const base = { platform, env: process.env, homedir: homedir() };

  return () => {
    const forced =
      process.env['FORGE_HOME'] !== undefined && process.env['FORGE_HOME'] !== '';

    const text = forced ? undefined : readIfPresent(core.bootstrapFilePath(base));
    const bootstrapHome =
      text === undefined ? undefined : core.parseBootstrapFile(text, platform);

    const home = core.resolveDataHome({ ...base, bootstrapHome });

    return core.dataHomeLayout(home, platform).installTokenPath;
  };
}

/**
 * The `server.proxy` table for the dev and preview servers. Throws nothing when the token is
 * missing: the server then answers 401 and the page shows its error state, which is the
 * truthful picture of "Forge is not set up on this machine yet".
 */
export async function forgeProxy(): Promise<Record<string, ProxyOptions>> {
  let source: InstallTokenSource | undefined;
  try {
    source = { tokenPath: await dataHomeTokenPath(), readText: readIfPresent };
  } catch {
    console.warn(
      '[forge-proxy] could not load @forge/core (run `pnpm build` once); /api calls will be sent without a token',
    );
  }

  const port = process.env['FORGE_PORT'] ?? DEFAULT_PORT;
  let warned = false;

  return {
    '/api': {
      target: `http://127.0.0.1:${port}`,
      // The server refuses any Host header that is not a loopback address.
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
      configure(proxy) {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('authorization');
          const token = source ? readInstallToken(source) : undefined;
          if (token !== undefined) {
            proxyReq.setHeader('authorization', `Bearer ${token}`);
            warned = false;
          } else if (!warned) {
            warned = true;
            console.warn(
              '[forge-proxy] no valid install token in the Forge data home; start Forge once with `forge start`',
            );
          }
        });
      },
    },
  };
}
