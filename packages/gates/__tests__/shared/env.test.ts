/**
 * Tests for the project-command environment helpers.
 *
 * Why: setup steps and gate checks run the repo's own scripts, so the environment they get is a
 *   security boundary (no server secrets), and the owner's tool folders (`.venv/bin`) must win
 *   on PATH or the install and the checks would use the machine's Python instead of the
 *   project's. Windows spells the variable `Path`; a second `PATH` key next to it would be
 *   ignored by some children.
 *
 * Pins: `pass_env` names reach the child while other secrets do not, forced variables win, PATH
 *   gets the folders first with the platform delimiter, the existing spelling of the variable is
 *   kept, and no folders means no change.
 * Depends on: shared/env, vitest.
 */

import { describe, expect, it } from 'vitest';
import { prependPath, scrubEnv } from '#/shared/env.js';

describe('scrubEnv with pass_env', () => {
  it('passes only the named extra variables and never a secret that is not named', () => {
    const out = scrubEnv(
      { PATH: '/bin', NPM_TOKEN: 't', ANTHROPIC_API_KEY: 'k', CI: 'no' },
      ['NPM_TOKEN'],
    );

    expect(out).toEqual({
      PATH: '/bin',
      NPM_TOKEN: 't',
      CI: '1',
      NoDefaultCurrentDirectoryInExePath: '1',
    });
  });
});

describe('prependPath', () => {
  it('puts the folders first, before the existing PATH', () => {
    expect(prependPath({ PATH: '/usr/bin' }, ['/wt/.venv/bin'], ':')).toEqual({
      PATH: '/wt/.venv/bin:/usr/bin',
    });
  });

  it('keeps the existing spelling of the variable (Path on Windows) and the other variables', () => {
    expect(prependPath({ Path: 'C:/Windows', CI: '1' }, ['C:/a', 'C:/b'], ';')).toEqual({
      Path: 'C:/a;C:/b;C:/Windows',
      CI: '1',
    });
  });

  it('creates PATH when there is none, and changes nothing without folders', () => {
    expect(prependPath({}, ['/x'], ':')).toEqual({ PATH: '/x' });
    expect(prependPath({ PATH: '/usr/bin' }, [], ':')).toEqual({ PATH: '/usr/bin' });
  });
});
