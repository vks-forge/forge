/**
 * Environment scrubbing for project commands.
 *
 * Why: gates run the repo's own scripts with the server's environment. `FORGE_*`
 *   variables carry run tokens and server config; a repo script (or a Worker-edited one)
 *   must never be able to read them.
 *
 * Exports: scrubEnv().
 * Depends on: none. No IO.
 */

/** Copy of `env` without undefined values and without any `FORGE_*` key (any case). */
export function scrubEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.toUpperCase().startsWith('FORGE_')) {
      continue;
    }

    out[key] = value;
  }

  return out;
}
