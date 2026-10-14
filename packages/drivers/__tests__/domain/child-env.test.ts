/**
 * Pins: which host variables a harness child may inherit.
 *
 * Why: a Worker runs model-chosen shell commands, so the server's secrets (catalogue key,
 * GitHub App credentials, API keys, cloud credentials) must never be in its environment,
 * while the login and process basics the harness needs must be. Opt-in passthrough exists
 * for api_key credential mode and must be explicit and name-exact.
 *
 * Depends on: src/domain/child-env. No IO.
 */

import { describe, expect, it } from 'vitest';
import { allowlistEnv, buildChildEnv } from '#/domain/child-env.js';
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
