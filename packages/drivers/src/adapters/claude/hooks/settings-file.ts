/**
 * Renders the per-run harness settings that wire our hook into Claude Code.
 *
 * Why: Claude Code's default when a hook crashes, times out or is missing is to let the
 *   tool run (probe 2 fail-open control). Every hook therefore carries `onFailure:
 *   "block"` and a `timeout`, and the matcher is `.*` so no tool, including the
 *   PowerShell the Windows CLI reports instead of Bash (d-0048), escapes `admit()`
 *   (d-0033). The harness timeout sits above the hook's own HTTP timeout so our
 *   fail-closed path, which names the reason, fires before the harness kills us blind.
 *   Paths use forward slashes inside double quotes so neither a Windows backslash nor a
 *   space in the path is mangled by the shell the harness uses to run the command.
 *
 * Exports: renderHookSettings(), renderAcpMeta(), DEFAULT_TOOL_MATCHER, HARNESS_TIMEOUT_MARGIN_S.
 * Depends on: @forge/tools/hook-wire, types/claude/settings-file. No IO.
 */

import { HOOK_EVENTS } from '@forge/tools/hook-wire';
import type { HookEventName } from '@forge/tools/hook-wire';
import type {
  AcpMeta,
  HookCommand,
  HookSettings,
  HookSettingsOptions,
} from '#/types/claude/settings-file.types.js';

/** Every tool: PreToolUse is the single chokepoint, so Edit/Write/Read get receipts too (d-0033). */
export const DEFAULT_TOOL_MATCHER = '.*';

/** Seconds added to the hook's own timeout to get the harness-side timeout. */
export const HARNESS_TIMEOUT_MARGIN_S = 2;

const TOOL_EVENTS: ReadonlySet<HookEventName> = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
]);

const quote = (path: string): string => `"${path.replace(/\\/g, '/')}"`;

export function renderHookSettings(opts: HookSettingsOptions): HookSettings {
  const hook: HookCommand = {
    type: 'command',
    command: `node ${quote(opts.hookJsPath)} --config ${quote(opts.configPath)}`,
    timeout: Math.ceil(opts.timeoutMs / 1000) + HARNESS_TIMEOUT_MARGIN_S,
    onFailure: 'block',
  };

  const matcher = opts.matcher ?? DEFAULT_TOOL_MATCHER;
  const hooks: Partial<
    Record<HookEventName, { matcher?: string; hooks: HookCommand[] }[]>
  > = {};

  for (const event of opts.events ?? HOOK_EVENTS) {
    hooks[event] = [
      TOOL_EVENTS.has(event) ? { matcher, hooks: [hook] } : { hooks: [hook] },
    ];
  }

  return { hooks };
}

/** `_meta` for ACP `session/new` / `session/load`: points the adapter at the settings file (probe 5a). */
export function renderAcpMeta(settingsPath: string): AcpMeta {
  return { claudeCode: { options: { settings: settingsPath } } };
}
