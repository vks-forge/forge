/**
 * Reports which Claude settings files exist for a run's working directory.
 *
 * Why: the ACP adapter reads the user's `settings.json`, the project's
 *   `.claude/settings.json` and `settings.local.json`, and managed settings no matter what
 *   `settingSources` says (probe 3 finding A, d-0049). The worktree carries the repo's own
 *   `.claude/settings.json`, so a Worker can start with permissions or hooks nobody
 *   configured for this run. The driver cannot switch those sources off, so it forces the
 *   permission mode and writes down, at the start of every run, which of the four files were
 *   present. When a run behaves oddly, that log line is how someone finds out why.
 *
 * Exports: settingsSourcePaths(), existingSettingsSources().
 * Depends on: node:fs/promises, node:path. IO: stats four paths.
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';

const MANAGED: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  linux: '/etc/claude-code/managed-settings.json',
};

/** The four files the adapter reads regardless of `settingSources: []`. */
export function settingsSourcePaths(
  cwd: string,
  homeDir: string,
  platform: NodeJS.Platform,
): string[] {
  const managed = MANAGED[platform];

  return [
    join(homeDir, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json'),
    ...(managed ? [managed] : []),
  ];
}

/** Those of the four that exist right now. */
export async function existingSettingsSources(
  paths: readonly string[],
): Promise<string[]> {
  const found: string[] = [];
  for (const p of paths) {
    try {
      await access(p);
      found.push(p);
    } catch {
      // absent is the normal case
    }
  }

  return found;
}
