/**
 * Environment contract of the Forge server process.
 *
 * Why: the server is the one process that reads environment variables (code.md rule 1).
 *   Declaring them as one schema means a typo in a port or an unknown engine fails at
 *   startup with a readable message instead of surfacing mid-ticket. An empty string is
 *   treated as unset, because shells and service managers commonly export empty values
 *   and `Number('')` would silently turn "no port given" into port 0.
 *
 * Exports: ServerEnv.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** An empty string means "not set" for every variable. */
const blankIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const text = z.preprocess(blankIsUnset, z.string().min(1).optional());

const integer = (min: number, max: number, fallback: number) =>
  z.preprocess(blankIsUnset, z.coerce.number().int().min(min).max(max).default(fallback));

export const ServerEnv = z.object({
  /** The folder whose `.forge/` holds project memory (a checkout of Forge itself in development). Projects are registered through the API, each with its own clone. Default: the current directory. Holds no Forge data. */
  FORGE_ROOT: text,
  /**
   * Data home override, an absolute folder, for development and tests only. Production uses
   * `%LOCALAPPDATA%\Forge` (or the folder named in `forge-home.json`); see config/data-home.
   */
  FORGE_HOME: text,
  /** Bind address. Only `127.0.0.1` is accepted; anything else is refused when the server starts. */
  FORGE_HOST: z.preprocess(blankIsUnset, z.string().min(1).default('127.0.0.1')),
  /** Bind port; 0 asks the OS for a free one (tests). */
  FORGE_PORT: integer(0, 65535, 4310),
  NODE_ENV: text,
  /** `claude` executable for the Director's steps; on Windows it must be a real `.exe`. */
  FORGE_CLAUDE_BINARY: text,
  /** Worker engine of the Claude driver. */
  FORGE_ENGINE: z.preprocess(blankIsUnset, z.enum(['acp', 'cli']).default('acp')),
  /**
   * Comma-separated host variable names a harness child may inherit beyond the built-in
   * allowlist. Default none. Only api_key credential mode (d-0031) needs it, e.g. `ANTHROPIC_API_KEY`.
   */
  FORGE_HARNESS_ENV_PASSTHROUGH: z.preprocess(
    blankIsUnset,
    z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n !== ''),
      ),
  ),
  /** How long shutdown waits for running gate jobs before closing anyway. */
  FORGE_SHUTDOWN_GRACE_MS: integer(0, 600_000, 30_000),
});
export type ServerEnv = z.infer<typeof ServerEnv>;
