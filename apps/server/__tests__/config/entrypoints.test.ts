/**
 * Tests for locating the per-run MCP server and the hook script.
 *
 * Why: a wrong path here shows up only as a Worker with no tools or a hook that never fires.
 *   The paths must follow the installed packages, not a count of `../` from a source file, so
 *   the same answer comes out whether the caller runs from `src/`, from `dist/`, or from a
 *   bundle a level deeper.
 *
 * Pins: the answer is the same from src and dist and from a nested folder, the MCP entry is
 *   the sibling app's built main.js, and the hook script is the one in the real
 *   `@forge/drivers` package.
 * Depends on: src/config/entrypoints, node:fs, node:path, node:url. IO: stats real files.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveEntrypoints } from '#/config/entrypoints.js';

const APP = fileURLToPath(new URL('../../', import.meta.url));
const at = (...parts: string[]): string => pathToFileURL(join(APP, ...parts)).href;

describe('resolveEntrypoints', () => {
  it('finds the sibling mcp app from src, dist and a deeper bundle folder', () => {
    const expected = join(APP, '..', 'mcp', 'dist', 'main.js');
    const fromSrc = resolveEntrypoints(at('src', 'config', 'paths.ts'));
    const fromDist = resolveEntrypoints(at('dist', 'config', 'paths.js'));
    const fromDeep = resolveEntrypoints(at('dist', 'a', 'b', 'bundle.js'));

    for (const found of [fromSrc, fromDist, fromDeep]) {
      expect(join(found.mcpEntry)).toBe(join(expected));
    }
  });

  it('points the hook at the bin/hook.js shipped by @forge/drivers', () => {
    const { hookJsPath } = resolveEntrypoints(import.meta.url);

    expect(hookJsPath.replaceAll('\\', '/')).toMatch(/drivers\/bin\/hook\.js$/);
    expect(existsSync(hookJsPath)).toBe(true);
  });

  it('fails clearly when no package.json exists above the caller', () => {
    expect(() => resolveEntrypoints(import.meta.url, () => false)).toThrow(
      /no package\.json/,
    );
  });
});
