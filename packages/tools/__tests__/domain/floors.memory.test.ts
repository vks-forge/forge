/**
 * Pins: a Worker has no path into a project's memory repository in the data home.
 *
 * Why: project memory is what the Director plans against, and only the Director writes it
 *   (d-0086). It lives in `<dataHome>/memory/<slug>/`, so the data-home floor is the wall:
 *   a Worker that could edit a decision, or even read other projects' memory, could steer
 *   later planning or leak another project. Every lane and every path tool must be denied
 *   there, by absolute path, including through `..` and mixed separators.
 *
 * Pins: admit() verdicts for read, edit and write on `<dataHome>/memory/...` in each lane.
 * Depends on: domain/admit, helpers/fixtures, vitest. No IO.
 */

import type { Lane } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { DATA_HOME, call, makeCtx } from '#tests/helpers/fixtures.js';

const LANES: readonly Lane[] = ['express', 'standard', 'full'];
const PATHS = [
  `${DATA_HOME}/memory/shop/decisions/d-0001.md`,
  `${DATA_HOME}/memory/shop/MEMORY.md`,
  `${DATA_HOME}/memory/shop/.git/HEAD`,
  `${DATA_HOME}/memory/other-project/proposed/x-0001.md`,
  `${DATA_HOME}/worktrees/shop/SF-1/../../../memory/shop/decisions/d-0001.md`,
  `${DATA_HOME}\\memory\\shop\\decisions\\d-0001.md`,
];

describe('the memory repository is out of every Worker reach', () => {
  it.each(LANES)('%s lane: read, edit and write are all denied', (lane) => {
    const ctx = makeCtx(lane);

    for (const tool of ['read', 'edit', 'write'] as const) {
      for (const path of PATHS) {
        const decision = admit(ctx, call(tool, { file_path: path }));

        expect(decision.decision, `${tool} ${path}`).toBe('deny');
      }
    }
  });

  it.each(LANES)(
    '%s lane: control, the same call form on the checkout is allowed',
    (lane) => {
      const ctx = makeCtx(lane);

      expect(
        admit(ctx, call('read', { file_path: '/work/repo/src/a.ts' })).decision,
      ).toBe('allow');
    },
  );
});
