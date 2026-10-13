/**
 * Writes the per-run files the harness reads: hook config, hook settings, MCP config.
 *
 * Why: the harness is configured by files, not by the driver's memory. The hook process
 *   learns its server and token only from `hook.json`, Claude Code learns where the hook
 *   lives from a `--settings` file (or the ACP `_meta` path to the same file), and the CLI
 *   engine learns its MCP servers from `--mcp-config`. All of them go under the run
 *   directory the app created (`.forge/data/runs/<id>/`), never into the worktree: a file
 *   in the worktree is something the Worker can edit and commit (d-0035). The token file is
 *   created owner-only where the OS supports it, and the config is validated by the same
 *   schema the hook parses with, so a bad URL fails here, before the run, not as a
 *   fail-closed hook on its first tool call.
 *
 * Exports: HOOK_TIMEOUT_MS, writeRunFiles().
 * Depends on: schemas/claude-hook-config, adapters/claude/hooks/settings-file,
 *   types/claude/driver-deps, types/claude/engine. IO: writes three files in the run dir.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderHookSettings } from '#/adapters/claude/hooks/settings-file.js';
import { HookConfig } from '#/schemas/claude-hook-config.js';
import type { PreparedRun } from '#/types/claude/driver-deps.types.js';
import type { RunFiles } from '#/types/claude/engine.types.js';

/** The hook's own HTTP timeout; `admit()` and one receipt append are fast. */
export const HOOK_TIMEOUT_MS = 5_000;

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Creates the three files and returns their absolute paths. */
export async function writeRunFiles(
  runId: string,
  prepared: PreparedRun,
  hookJsPath: string,
): Promise<RunFiles> {
  const files: RunFiles = {
    hookConfigPath: join(prepared.runDir, 'hook.json'),
    settingsPath: join(prepared.runDir, 'settings.json'),
    mcpConfigPath: join(prepared.runDir, 'mcp.json'),
  };

  const hookConfig = HookConfig.parse({
    run_id: runId,
    server_url: prepared.hookServerUrl,
    token: prepared.hookToken,
    timeout_ms: HOOK_TIMEOUT_MS,
  });

  const settings = renderHookSettings({
    hookJsPath,
    configPath: files.hookConfigPath,
    timeoutMs: HOOK_TIMEOUT_MS,
  });

  const mcpServers = Object.fromEntries(
    prepared.mcpServers.map((s) => [
      s.name,
      { command: s.command, args: [...s.args], env: { ...s.env } },
    ]),
  );

  await mkdir(prepared.runDir, { recursive: true });
  await writeFile(files.hookConfigPath, json(hookConfig), { mode: 0o600 });
  await writeFile(files.settingsPath, json(settings));
  await writeFile(files.mcpConfigPath, json({ mcpServers }));

  return files;
}
