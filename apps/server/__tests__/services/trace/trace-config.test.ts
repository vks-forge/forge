/**
 * The trace ConfigSource decorator: settings saves appear in the trace.
 *
 * Why: a run behaves according to the config version it started under, and a save through the
 *   Settings page changes behaviour for the next tick; when something acts oddly the owner
 *   needs to see when and by whom the settings last changed (d-0163). Saves go through the
 *   ConfigSource, not storage, so they get their own thin wrapper. Reads pass through untouched
 *   and a failed save (a version conflict) is logged as a warning and still thrown.
 *
 * Pins: a save logs scope, project, author, reason, document and the new version; a conflict
 *   is logged as a warning and rethrown; reads are silent and unchanged.
 * Depends on: src/services/trace/trace-config, @forge/db (memory config), vitest.
 */

import type { TraceInput } from '@forge/core';
import { createMemoryConfigSource } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { traceConfigWrites } from '#/services/trace/trace-config.js';

const clock = { now: () => 1_000, after: () => () => undefined };

function rig() {
  const entries: TraceInput[] = [];
  const config = traceConfigWrites(createMemoryConfigSource(clock), {
    emit: (e) => void entries.push(e),
  });

  return { config, entries };
}

describe('traceConfigWrites', () => {
  it('logs a company save with who, why and the document', async () => {
    const { config, entries } = rig();

    const saved = await config.append({
      scope: 'company',
      doc: { engine: { step_retries: 2 } },
      author: 'owner',
      reason: 'try more retries',
      expectedVersion: 0,
    });

    expect(saved.version).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'config', actor: 'owner', level: 'info' });
    expect(entries[0]?.message).toContain('company');
    expect(entries[0]?.data).toMatchObject({
      scope: 'company',
      author: 'owner',
      reason: 'try more retries',
      doc: { engine: { step_retries: 2 } },
      version: 1,
    });
  });

  it('logs a conflict as a warning and rethrows it', async () => {
    const { config, entries } = rig();

    await expect(
      config.append({
        scope: 'company',
        doc: {},
        author: 'owner',
        reason: 'stale',
        expectedVersion: 5,
      }),
    ).rejects.toThrow();

    expect(entries[0]).toMatchObject({ kind: 'config', level: 'warn' });
  });

  it('leaves reads silent', async () => {
    const { config, entries } = rig();

    const view = await config.company();
    await config.history('company');

    expect(view.version).toBe(0);
    expect(entries).toEqual([]);
  });
});
