/**
 * Types for the per-run harness settings file that registers the hooks.
 *
 * Why: the driver hands the harness a settings file (CLI `--settings`, or the ACP
 *   `_meta.claudeCode.options.settings` path) and the shape must match what Claude Code
 *   accepts exactly, because an invalid settings file is silently ignored under `-p`
 *   (probe 2) and an ignored hooks block means a Worker running with no chokepoint.
 *
 * Exports: HookCommand, HookMatcherGroup, HookSettings, HookSettingsOptions, AcpMeta.
 * Depends on: @forge/tools/hook-wire. Types only.
 */

import type { HookEventName } from '@forge/tools/hook-wire';

export interface HookCommand {
  readonly type: 'command';
  readonly command: string;
  /** Seconds, as Claude Code reads it. */
  readonly timeout: number;
  readonly onFailure: 'block';
}

export interface HookMatcherGroup {
  readonly matcher?: string;
  readonly hooks: readonly HookCommand[];
}

export interface HookSettings {
  readonly hooks: Partial<Record<HookEventName, readonly HookMatcherGroup[]>>;
}

export interface HookSettingsOptions {
  /** Absolute path of `bin/hook.js`. */
  readonly hookJsPath: string;
  /** Absolute path of the run's `hook.json`; passed as `--config` in case env is scrubbed. */
  readonly configPath: string;
  /** The hook's own HTTP timeout; the harness timeout is set a little above it. */
  readonly timeoutMs: number;
  /** Defaults to all four events. */
  readonly events?: readonly HookEventName[];
  /** Tool-name matcher for the tool events. Defaults to `.*` (every tool); narrow only deliberately. */
  readonly matcher?: string;
}

export interface AcpMeta {
  readonly claudeCode: { readonly options: { readonly settings: string } };
}
