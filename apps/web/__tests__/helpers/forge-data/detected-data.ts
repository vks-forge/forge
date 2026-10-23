/**
 * Test data: what Forge "detects" in each sample project's folder.
 *
 * Why: the setup editor, the Project tab and "Detect again" are about the gap between what Forge
 *   finds in a folder and what the owner saved, and the sample projects must cover more than one
 *   language so no screen quietly assumes Node: one project installs with pnpm, one with uv, one
 *   has no ecosystem at all. Rows are parsed with core's own schema, so a drift from the server's
 *   shape fails at import.
 *
 * Exports: detectedData, detectedOf().
 * Depends on: @forge/core (SetupStep).
 */

import { SetupStep } from '@forge/core';

const step = (
  name: string,
  command: string,
  inputs: string[],
  cache: { cache_env?: Record<string, string>; cache_outputs?: string[] } = {},
) => SetupStep.parse({ name, command, inputs, ...cache });

/** The reply of `GET /projects/:slug/detected`, per sample slug. */
export const detectedData: Readonly<
  Record<string, { ecosystems: string[]; checks: unknown[]; setup: SetupStep[] }>
> = {
  'sample-service': {
    ecosystems: ['node'],
    checks: [],
    setup: [
      step(
        'Install packages',
        'pnpm install --frozen-lockfile',
        ['pnpm-lock.yaml', 'package.json'],
        { cache_env: { npm_config_store_dir: 'pnpm' }, cache_outputs: ['node_modules'] },
      ),
    ],
  },
  'sample-web': {
    ecosystems: ['python'],
    checks: [],
    setup: [
      step('Install packages', 'uv sync --frozen', ['uv.lock', 'pyproject.toml'], {
        cache_env: { UV_CACHE_DIR: 'uv' },
      }),
    ],
  },
  'sample-docs': { ecosystems: [], checks: [], setup: [] },
};

/** The detected view of a slug; an unlisted project detects nothing. */
export function detectedOf(slug: string) {
  return detectedData[slug] ?? { ecosystems: [], checks: [], setup: [] };
}
