/**
 * Shapes of the server's harness compatibility service.
 *
 * Why: the compatibility check runs in the background, its result decides whether a harness
 *   is paused and which of its built-in tools Workers may use, and the owner reads and acts
 *   on it from Settings. The service and its port are described here so the routes, the
 *   tool policy and the assembly agree on one surface, and so tests can replace the real
 *   check (a minute of driving a real harness) with a scripted one.
 *
 * Exports: CompatPort, HarnessCompatDeps, HarnessCompat, HarnessCompatView, ToolSchemaView.
 * Depends on: @forge/core, @forge/drivers (types). Types only.
 */

import type { CompatReport, HarnessToolSchema, HarnessVersion } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import type { CatalogueStore } from '@forge/tools';
import type { CompatJobState, HarnessSetup, NativeToolNames } from '@forge/drivers';

/** The real check, injected: reads the installed build and runs the scripted session on it. */
export interface CompatPort {
  /** Engine the Worker driver uses; the check drives the same one. */
  readonly engine: 'acp' | 'cli';
  /** The installed build, or null when no executable or no version could be found. */
  installedVersion(setup: HarnessSetup): Promise<string | null>;
  check(setup: HarnessSetup, nativeTools: NativeToolNames): Promise<CompatReport>;
}

/** What `GET /harnesses/:id/compat` answers. */
export interface HarnessCompatView {
  readonly version: string | null;
  readonly compat: HarnessVersion['compat'] | 'unknown';
  readonly report: CompatReport | null;
  readonly checked_at: string | null;
  readonly job: CompatJobState;
}

/** What `GET /harnesses/:id/tools` lists. */
export interface ToolSchemaView {
  readonly version: string | null;
  readonly tools: readonly HarnessToolSchema[];
}

/** What the compatibility service reads and writes. */
export interface HarnessCompatDeps {
  readonly storage: StorageAdapter;
  readonly catalogue: CatalogueStore;
  /** Absent in builds without a real harness: nothing is ever checked and no build is known. */
  readonly port: CompatPort | undefined;
  /** Key of `support` in catalogue entries for this harness (the driver id). */
  readonly supportKey: string;
  readonly now: () => number;
  readonly log: Logger;
}

export interface HarnessCompat {
  /** Build last seen for the harness, null before the first look or when none is installed. */
  installedVersion(harnessId: string): string | null;
  /**
   * Reads the installed build and, the first time it is seen, either records it as verified
   * (shipped list) or starts the background check. Never throws; a harness that is not
   * installed leaves the build unknown.
   */
  observe(harnessId: string): Promise<string | null>;
  /**
   * Asks, before a run starts, which build is installed now. Returns the loaded build when
   * it is unchanged (null when none is known); when the installed build differs from the
   * one the approvals were loaded for, starts the first-sight check of the new build in the
   * background and throws `HarnessChangedError` so the start is refused. A build that cannot
   * be read is not a change.
   */
  assertCurrent(harnessId: string): Promise<string | null>;
  /** Starts a check now (or returns the one running). */
  start(harnessId: string): Promise<CompatJobState>;
  view(harnessId: string): Promise<HarnessCompatView>;
  tools(harnessId: string): Promise<ToolSchemaView>;
  /** Approves or denies the stored schema of one tool of the installed build; null when there is no such row. */
  decide(
    harnessId: string,
    tool: string,
    decision: 'approved' | 'denied',
    by: { readonly author: string; readonly reason: string },
  ): Promise<HarnessToolSchema | null>;
  /** Resolves when no check is running (tests and shutdown). */
  idle(): Promise<void>;
}
