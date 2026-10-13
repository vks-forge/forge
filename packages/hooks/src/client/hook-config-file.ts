/**
 * Locating and parsing the per-run hook config file.
 *
 * Why: the hook process knows nothing but its stdin, env and argv. The driver points it
 *   at the run's `hook.json` with `--config <path>` baked into the settings-file command,
 *   which wins; the env var is used only when argv names no path. A missing pointer, unreadable file or invalid contents
 *   all surface as a typed failure so the hook can fail closed with a specific code.
 *
 * Exports: resolveConfigPath(), loadHookConfig().
 * Depends on: schemas/hook-config, types/hook-client. IO: reads one file via io.readFile.
 */

import { HOOK_CONFIG_ENV, HookConfig } from '#/schemas/hook-config.js';
import type { HookIo } from '#/types/hook-client.types.js';

/**
 * `--config <path>` / `--config=<path>` from argv first (it is baked into the settings
 * command by the driver, so a scrubbed or poisoned env cannot redirect the hook), then the
 * env var only when argv names none.
 */
export function resolveConfigPath(io: Pick<HookIo, 'env' | 'argv'>): string | null {
  for (const [i, arg] of io.argv.entries()) {
    if (arg === '--config') return io.argv[i + 1] ?? null;
    if (arg.startsWith('--config=')) return arg.slice('--config='.length) || null;
  }
  return io.env[HOOK_CONFIG_ENV] || null;
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
