/**
 * Locates the programs the server starts for a run: the per-run MCP server and the hook.
 *
 * Why: every Worker run is given two child processes by path, the `forge` MCP server (its
 *   tools) and the hook script (the policy door on each tool call). Hard-coding `../../..`
 *   hops from a source file breaks the moment the server is bundled or installed from a
 *   package, and a wrong path only shows up as a Worker with no tools. This is the one
 *   resolver: the app's root is found from the URL of the calling module (whether it sits
 *   in `src/` or `dist/`, at any depth), the MCP entry is the built `main.js` of the sibling
 *   `mcp` app, and the hook is found through the `@forge/drivers` package that ships it,
 *   using the normal node_modules lookup so it works built or not.
 *
 * Exports: resolveEntrypoints(), resolveWebRoot().
 * Depends on: node:fs, node:module, node:path, node:url, types/entrypoints.
 *   IO: stats package.json files.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Entrypoints } from '#/types/entrypoints.types.js';

/** Nearest directory at or above `start` that holds a `package.json`. */
function packageRoot(start: string, exists: (p: string) => boolean): string {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (exists(join(dir, 'package.json'))) {
      return dir;
    }

    if (dirname(dir) === dir) {
      throw new Error(`no package.json at or above ${start}`);
    }
  }
}

/** Root of an installed dependency, found the way node finds it, without loading its code. */
function installedPackage(
  moduleUrl: string,
  name: string,
  exists: (p: string) => boolean,
): string {
  const lookup = createRequire(moduleUrl).resolve.paths(name) ?? [];
  for (const base of lookup) {
    const root = join(base, name);
    if (exists(join(root, 'package.json'))) {
      return root;
    }
  }

  throw new Error(`package ${name} is not installed for ${moduleUrl}`);
}

/**
 * Resolves both entry points relative to the installed packages, starting from the URL of
 * the calling module (`import.meta.url`). The files themselves are not required to exist yet:
 * the MCP app must be built before a live run, and preparing a run reports that clearly.
 */
export function resolveEntrypoints(
  moduleUrl: string,
  exists: (path: string) => boolean = existsSync,
): Entrypoints {
  const appRoot = packageRoot(dirname(fileURLToPath(moduleUrl)), exists);
  const drivers = installedPackage(moduleUrl, '@forge/drivers', exists);

  return {
    mcpEntry: join(dirname(appRoot), 'mcp', 'dist', 'main.js'),
    hookJsPath: join(drivers, 'bin', 'hook.js'),
  };
}

/**
 * The built control room: `dist/web` of the sibling `web` app, found from the URL of the
 * calling module the same way as the MCP entry (never from the working directory). Returns
 * undefined unless its `index.html` exists, so a checkout that has not run `vite build`
 * serves the API alone instead of a half-working UI.
 */
export function resolveWebRoot(
  moduleUrl: string,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  const appRoot = packageRoot(dirname(fileURLToPath(moduleUrl)), exists);
  const root = join(dirname(appRoot), 'web', 'dist', 'web');

  return exists(join(root, 'index.html')) ? root : undefined;
}
