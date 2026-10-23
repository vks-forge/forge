/**
 * Pins: which host variables a harness child may inherit.
 *
 * Why: a Worker runs model-chosen shell commands, so the server's secrets (catalogue key,
 * GitHub App credentials, API keys, cloud credentials) must never be in its environment,
 * while the login and process basics the harness needs must be. Opt-in passthrough exists
 * for api_key credential mode and must be explicit and name-exact.
 *
 * The project's own tool folders (a virtual environment's `bin`) go first on PATH, so the Worker
 * runs the project's `pytest`, under whatever spelling the host uses for the variable.
 *
 * Depends on: src/domain/child-env. No IO.
 */

import { describe, expect, it } from 'vitest';
import { allowlistEnv, buildChildEnv, withPathFirst } from '#/domain/child-env.js';
import { SECRET_ENV, SECRET_NAMES } from '#tests/helpers/secret-env.js';

describe('allowlistEnv', () => {
  it('drops every server secret and keeps the profile and process basics', () => {
    const env = allowlistEnv({
      ...SECRET_ENV,
      Path: 'p',
      USERPROFILE: 'u',
      SystemRoot: 'c:\windows',
      CLAUDE_CONFIG_DIR: 'cfg',
      MY_OTHER_TOKEN: 'x',
    });

    for (const name of SECRET_NAMES) {
      expect(env).not.toHaveProperty(name);
    }

    expect(env).toEqual({
      Path: 'p',
      USERPROFILE: 'u',
      SystemRoot: 'c:\windows',
      CLAUDE_CONFIG_DIR: 'cfg',
    });
  });

  it('passes a named variable through only when it is listed, ignoring case', () => {
    const env = allowlistEnv({ ...SECRET_ENV, PATH: 'p' }, ['anthropic_api_key']);

    expect(env).toEqual({ PATH: 'p', ANTHROPIC_API_KEY: 'sk-secret' });
  });

  it('never lets a secret through buildChildEnv from a filtered base', () => {
    const env = buildChildEnv(allowlistEnv({ ...SECRET_ENV, PATH: 'p' }), {}, {});

    expect(Object.keys(env)).toEqual(['PATH']);
  });
});

describe('buildChildEnv credential variables (d-0087)', () => {
  it('removes a credential variable from every layer, whatever its case', () => {
    const env = buildChildEnv(
      { PATH: 'p', ANTHROPIC_API_KEY: 'from-host' },
      { anthropic_api_key: 'from-request' },
      { CLAUDE_CODE_OAUTH_TOKEN: 'from-prepared' },
    );

    expect(env).toEqual({ PATH: 'p' });
  });

  it('adds only the auth env of the harness, last', () => {
    const env = buildChildEnv(
      { PATH: 'p', ANTHROPIC_API_KEY: 'from-host' },
      {},
      {},
      { CLAUDE_CODE_OAUTH_TOKEN: 'tok' },
    );

    expect(env).toEqual({ PATH: 'p', CLAUDE_CODE_OAUTH_TOKEN: 'tok' });
  });
});

describe('withPathFirst', () => {
  it('puts the folders first, keeping the variable spelling of the host', () => {
    expect(withPathFirst({ Path: 'C:\Windows' }, ['C:\w\.venv\Scripts'], ';')).toEqual({
      Path: 'C:\w\.venv\Scripts;C:\Windows',
    });
  });

  it('sets PATH when there is none, and changes nothing without folders', () => {
    expect(withPathFirst({ HOME: 'h' }, ['/w/.venv/bin'], ':')).toEqual({
      HOME: 'h',
      PATH: '/w/.venv/bin',
    });

    expect(withPathFirst({ PATH: 'p' }, [], ':')).toEqual({ PATH: 'p' });
  });
});
