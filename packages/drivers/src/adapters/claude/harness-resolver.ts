/**
 * Finds the user's installed `claude` and reads the credential its auth mode needs.
 *
 * Why: Workers and the Director run the `claude` the user installed and signed in to
 *   (d-0087). Every run must therefore answer two questions from current settings: which
 *   executable (the registry's override path, else the server's configured default, else
 *   PATH) and which credential. A missing install fails closed with the install pointer;
 *   there is no silent fallback to a bundled copy. A missing API key or token is an `auth`
 *   error before any process starts, and so is a paused harness (its installed build failed
 *   the compatibility check, d-0088), so no Worker starts on a build known to break policy; so the owner sees "paste a key" instead of a Worker
 *   that dies at its first prompt. The secret is read from the SecretStore per call and
 *   returned only inside `authEnv`; it is never logged and never taken from the server's
 *   own environment.
 *
 * Exports: createHarnessResolver(), DEFAULT_HARNESS_ID.
 * Depends on: @forge/core (AuthError, harnessSecretName, SecretStore), domain/claude-binary,
 *   domain/child-env, domain/harness-auth, types/claude/harness. IO: file-existence checks
 *   (injected) and SecretStore reads.
 */

import { AuthError, harnessSecretName } from '@forge/core';
import { resolveInstalledClaude } from '#/domain/claude-binary.js';
import { authEnvFor } from '#/domain/harness-auth.js';
import type { EnvLike } from '#/types/claude/driver-deps.types.js';
import type {
  HarnessResolver,
  HarnessResolverDeps,
  HarnessSetup,
} from '#/types/claude/harness.types.js';

/** Registry id used when the app gives no harness source: the single built-in `claude`. */
export const DEFAULT_HARNESS_ID = 'claude';

function pathVar(env: EnvLike): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');

  return key === undefined ? undefined : env[key];
}

export function createHarnessResolver(deps: HarnessResolverDeps): HarnessResolver {
  const setup = async (): Promise<HarnessSetup> =>
    (await deps.source?.()) ?? { id: DEFAULT_HARNESS_ID, authMode: 'login' };

  const binary = async () => {
    const s = await setup();
    const binaryPath = resolveInstalledClaude(s.binaryPath ?? deps.defaultBinary, {
      platform: deps.platform,
      pathVar: pathVar(deps.env),
      exists: deps.exists,
    });

    return { s, resolved: { id: s.id, binaryPath, authMode: s.authMode } };
  };

  return {
    async binary() {
      return (await binary()).resolved;
    },

    async forRun() {
      const { s, resolved } = await binary();
      if (s.pausedReason !== undefined) {
        throw new AuthError(`harness ${s.id} is paused: ${s.pausedReason}`);
      }

      if (s.authMode === 'login') {
        return { ...resolved, authEnv: {} };
      }

      const name = harnessSecretName(s.id, s.authMode);
      const bytes = (await deps.secrets?.get(name)) ?? null;
      const secret = bytes === null ? '' : new TextDecoder().decode(bytes).trim();
      if (secret === '') {
        throw new AuthError(
          `harness ${s.id} is set to ${s.authMode} but no ${s.authMode === 'api_key' ? 'API key' : 'OAuth token'} is stored; add one in Settings`,
        );
      }

      return { ...resolved, authEnv: authEnvFor(s.authMode, secret) };
    },
  };
}
