/**
 * Builds the environment of the harness child process.
 *
 * Why: a Worker's harness must start the same way whether Forge itself runs inside Claude
 *   Code or not. `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` make a child `claude` refuse to
 *   start (it thinks it is nested), and a leftover `FORGE_HOOK_CONFIG` could point the hook
 *   at another run's token file; the hook gets its config path from `--config` in the
 *   settings command instead (d-0033). The harness needs the user's login (profile dir,
 *   PATH), but a Worker runs model-chosen shell commands, so it must not inherit the
 *   server's secrets: the catalogue signing key, GitHub App credentials, API keys, cloud
 *   credentials. The host environment is therefore reduced to an allowlist before it is
 *   the base (subscription auth needs only the profile directory, d-0031); anything else
 *   is an explicit opt-in by name. Per-run and request values layer on top. Windows env
 *   names are case-insensitive, so matching ignores case. The credential variables
 *   (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`) are different again: whichever layer
 *   carried them, they are removed, and only the harness's configured auth mode puts one
 *   back, so a stray key in the server's environment can never change who pays (d-0087).
 *
 * Exports: STRIPPED_ENV, HARNESS_ENV_ALLOWLIST, allowlistEnv(), buildChildEnv(), withPathFirst().
 * Depends on: domain/harness-auth, types/claude/driver-deps. No IO.
 */

import { AUTH_ENV_NAMES } from '#/domain/harness-auth.js';
import type { EnvLike } from '#/types/claude/driver-deps.types.js';

/** Variables removed from every harness child, whatever set them. */
export const STRIPPED_ENV = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'FORGE_HOOK_CONFIG',
] as const;

/**
 * Host variables a harness child may inherit: process basics, the user profile (where the
 * subscription login lives) and the shell locations Claude Code needs on Windows. Nothing
 * that holds a credential belongs here; add a name through `envPassthrough` instead.
 */
export const HARNESS_ENV_ALLOWLIST: readonly string[] = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'COMMONPROGRAMFILES',
  'COMMONPROGRAMFILES(X86)',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
  'LANG',
  'LC_ALL',
  'TERM',
  'USERNAME',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_GIT_BASH_PATH',
];

/**
 * Keeps only the allowlisted names (plus `extra`, an explicit opt-in such as
 * `ANTHROPIC_API_KEY` in api_key mode, d-0031), case-insensitively, and drops undefined.
 */
export function allowlistEnv(
  base: EnvLike,
  extra: readonly string[] = [],
): Record<string, string> {
  const allowed = new Set(
    [...HARNESS_ENV_ALLOWLIST, ...extra].map((n) => n.toUpperCase()),
  );

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && allowed.has(key.toUpperCase())) {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Merges host, request and prepared env (later wins), drops undefined values and the
 * stripped names, removes every credential variable, then adds `authEnv` (the one the
 * harness's auth mode asks for) last.
 */
export function buildChildEnv(
  base: EnvLike,
  requestEnv: EnvLike,
  preparedEnv: EnvLike,
  authEnv: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of [base, requestEnv, preparedEnv]) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        out[key] = value;
      }
    }
  }

  const stripped = new Set<string>([...STRIPPED_ENV, ...AUTH_ENV_NAMES]);
  for (const key of Object.keys(out)) {
    if (stripped.has(key.toUpperCase())) {
      delete out[key];
    }
  }

  return { ...out, ...authEnv };
}

/**
 * A copy of `env` with `dirs` first on PATH, so the project's own tool folders (a virtual
 * environment's `bin`) win. The variable keeps its own spelling (`Path` on Windows).
 */
export function withPathFirst(
  env: Readonly<Record<string, string>>,
  dirs: readonly string[],
  separator: string,
): Record<string, string> {
  if (dirs.length === 0) {
    return { ...env };
  }

  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const rest = env[key];

  return {
    ...env,
    [key]: [...dirs, ...(rest === undefined || rest === '' ? [] : [rest])].join(
      separator,
    ),
  };
}
