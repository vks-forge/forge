/**
 * A scripted harness compatibility check over in-memory storage.
 *
 * Why: the real check drives a real harness for about a minute. The service around it (first
 *   sight, pause, approvals) is what the tests are about, so they swap the check for a
 *   scripted one whose installed build and outcome they set, and count how many times it ran.
 *
 * Exports: makeCompatRig(), compatReport(), CompatRig.
 * Depends on: src/services/harness-compat, @forge/db memory stores. No IO.
 */

import { createMemoryCatalogueStore, createMemoryStorage } from '@forge/db';
import type { CompatReport, HarnessToolSchema, StorageAdapter } from '@forge/core';
import { createHarnessCompat } from '#/services/harness-compat.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

export const hash = (c: string): string => `sha256:${c.repeat(64)}`;

export const compatReport = (
  version: string,
  over: Partial<CompatReport> = {},
  tools: CompatReport['tools'] = [
    { tool: 'read', native: ['Read'], schema_hash: hash('a') },
    { tool: 'edit', native: ['Edit'], schema_hash: hash('b') },
  ],
): CompatReport => ({
  kind: 'claude',
  version,
  started_at: '2026-10-14T10:00:00.000Z',
  finished_at: '2026-10-14T10:01:00.000Z',
  passed: true,
  summary: `Build ${version} passed all compatibility checks.`,
  checks: [],
  tools,
  ...over,
});

export interface CompatRig {
  readonly storage: StorageAdapter;
  /** The build the scripted port reports as installed. */
  installed: string | null;
  engine: 'acp' | 'cli';
  /** What the scripted check returns (or throws) for the installed build. */
  outcome: (version: string) => CompatReport | Error;
  /** How many times the scripted check ran. */
  checks: number;
  service(withPort?: boolean): HarnessCompat;
  rows(version: string): Promise<HarnessToolSchema[]>;
}

export function makeCompatRig(): CompatRig {
  const storage = createMemoryStorage();
  const rig: CompatRig = {
    storage,
    installed: '9.9.9',
    engine: 'acp',
    outcome: (v) => compatReport(v),
    checks: 0,
    service: (withPort = true) =>
      createHarnessCompat({
        storage,
        catalogue: createMemoryCatalogueStore(),
        port: withPort
          ? {
              engine: rig.engine,
              installedVersion: async () => rig.installed,
              check: async () => {
                rig.checks += 1;
                const out = rig.outcome(rig.installed ?? '');
                if (out instanceof Error) {
                  throw out;
                }

                return out;
              },
            }
          : undefined,
        supportKey: 'claude-code',
        now: () => Date.UTC(2026, 9, 14, 12, 0, 0),
        log: () => undefined,
      }),
    rows: (version) =>
      storage.transaction((tx) => tx.harnessToolSchemas.list('claude', version)),
  };

  return rig;
}
