/**
 * Environment allowlist for project commands.
 *
 * Why: gates run the repo's own scripts, and a Worker can rewrite what those scripts
 *   execute. Handing them the server's whole environment would give Worker-written code
 *   `ANTHROPIC_API_KEY`, `GH_TOKEN`, `FORGE_*` run tokens and anything else the server
 *   holds. Only the variables a build tool needs to find itself and its temp space are
 *   passed (plus names the caller lists in `passEnv`). `CI=1` keeps tools non-interactive
 *   and `NoDefaultCurrentDirectoryInExePath=1` stops cmd.exe resolving commands from the
 *   Worker's tree. This narrows the leak; it does not isolate the process (see README Limits).
 *
 * Exports: scrubEnv(), ALLOWED_ENV, FORCED_ENV.
 * Depends on: none. No IO.
 */

/** Names (matched case-insensitively) copied from the parent environment. */
export const ALLOWED_ENV: readonly string[] = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'ComSpec',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'CommonProgramFiles',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
  'LANG',
  'TERM',
];

/** Set after copying, so neither the parent environment nor `passEnv` can override them. */
export const FORCED_ENV: Readonly<Record<string, string>> = {
  CI: '1',
  NoDefaultCurrentDirectoryInExePath: '1',
};

/** Allowlisted (and `passEnv`) entries of `env` with the forced variables set on top. */
export function scrubEnv(
  env: Readonly<Record<string, string | undefined>>,
  passEnv: readonly string[] = [],
): Record<string, string> {
  const allowed = new Set([...ALLOWED_ENV, ...passEnv].map((n) => n.toUpperCase()));
  const forced = new Set(Object.keys(FORCED_ENV).map((n) => n.toUpperCase()));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const name = key.toUpperCase();
    if (value !== undefined && allowed.has(name) && !forced.has(name)) {
      out[key] = value;
    }
  }

  return { ...out, ...FORCED_ENV };
}
