/**
 * Builds the environment of the harness child process.
 *
 * Why: a Worker's harness must start the same way whether Forge itself runs inside Claude
 *   Code or not. `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` make a child `claude` refuse to
 *   start (it thinks it is nested), and a leftover `FORGE_HOOK_CONFIG` could point the hook
 *   at another run's token file; the hook gets its config path from `--config` in the
 *   settings command instead (d-0033). The host environment is the base because the
 *   harness needs the user's login (profile dir, PATH); per-run and request values layer
 *   on top. Windows env names are case-insensitive, so stripping ignores case.
 *
 * Exports: STRIPPED_ENV, buildChildEnv().
 * Depends on: types/claude/driver-deps. No IO.
 */

import type { EnvLike } from '#/types/claude/driver-deps.types.js';

/** Variables removed from every harness child, whatever set them. */
export const STRIPPED_ENV = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'FORGE_HOOK_CONFIG',
] as const;

/** Merges host, request and prepared env (later wins), drops undefined values and the stripped names. */
export function buildChildEnv(
  base: EnvLike,
  requestEnv: EnvLike,
  preparedEnv: EnvLike,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of [base, requestEnv, preparedEnv]) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        out[key] = value;
      }
    }
  }

  const stripped = new Set<string>(STRIPPED_ENV);
  for (const key of Object.keys(out)) {
    if (stripped.has(key.toUpperCase())) {
      delete out[key];
    }
  }

  return out;
}
