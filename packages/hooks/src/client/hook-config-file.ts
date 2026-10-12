/**
 * Locating and parsing the per-run hook config file.
 *
 * Why: the hook process knows nothing but its stdin, env and argv. The driver points it
 *   at the run's `hook.json` through an env var set in the harness environment, with
 *   `--config <path>` baked into the settings-file command as a fallback for harnesses
 *   that scrub the environment. A missing pointer, unreadable file or invalid contents
 *   all surface as a typed failure so the hook can fail closed with a specific code.
 *
 * Exports: resolveConfigPath(), loadHookConfig().
 * Depends on: schemas/hook-config, types/hook-client. IO: reads one file via io.readFile.
 */

import { HOOK_CONFIG_ENV, HookConfig } from '#/schemas/hook-config.js';
import type { HookIo } from '#/types/hook-client.types.js';

/** Env var first, then `--config <path>` / `--config=<path>` from argv. */
export function resolveConfigPath(io: Pick<HookIo, 'env' | 'argv'>): string | null {
  const fromEnv = io.env[HOOK_CONFIG_ENV];
  if (fromEnv) return fromEnv;
  for (const [i, arg] of io.argv.entries()) {
    if (arg === '--config') return io.argv[i + 1] ?? null;
    if (arg.startsWith('--config=')) return arg.slice('--config='.length) || null;
  }
  return null;
}

/** Reads and validates the config; throws an Error whose message is the failure code. */
export async function loadHookConfig(io: HookIo): Promise<HookConfig> {
  const path = resolveConfigPath(io);
  if (!path) throw new Error('config_missing');
  let raw: string;
  try {
    raw = await io.readFile(path);
  } catch {
    throw new Error('config_unreadable');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('config_invalid');
  }
  const parsed = HookConfig.safeParse(json);
  if (!parsed.success) throw new Error('config_invalid');
  return parsed.data;
}
