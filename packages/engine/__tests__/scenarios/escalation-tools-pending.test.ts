/**
 * A harness build whose tools still wait for the owner parks the ticket instead of starting a run.
 *
 * Why: after a Claude Code update the new build's tools can be pending; a Worker started then is
 *   denied on every call and the owner is told to "fix the hook" in code they never touch. The
 *   start is refused (`HarnessToolsPendingError`), the ticket waits on a setup item for the build
 *   and no run exists; it must resume by itself the moment the owner has decided every tool, and
 *   not before.
 *
 * Pins: the refused start raises one `harness_build` setup (no failure item), parks the ticket,
 *   starts nothing on later ticks while a tool is pending, and starts once all are approved.
 * Depends on: helpers/rig, helpers/escalation-rig. No IO.
 */

import { HarnessToolsPendingError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('a build whose tools are still pending', () => {
  const tool = (name: string, status: 'pending' | 'approved') => ({
    harness_kind: 'claude' as const,
    version: '2.1.304',
    tool: name,
    schema_hash: `sha256:${'a'.repeat(64)}`,
    status,
  });

  it('parks the ticket for the owner with no run, and starts once the tools are approved', async () => {
    const rig = await makeRig();
    await rig.storage.transaction(async (tx) => {
      await tx.harnessVersions.upsert({
        kind: 'claude',
        version: '2.1.304',
        compat: 'pass',
      });

      await tx.harnessToolSchemas.upsert(tool('read', 'pending'));
      await tx.harnessToolSchemas.upsert(tool('shell', 'pending'));
    });

    const id = await rig.request('Do the thing');
    rig.driver.failNextStart(new HarnessToolsPendingError('2.1.304', ['read', 'shell']));
    await rig.tick();
    await rig.tick();

    const [row] = await pendingOf(rig, id, 'setup');
    const startsWhileParked = rig.driver.starts.length;

    expect(row!.payload).toMatchObject({
      cause: { type: 'harness_build', harness_kind: 'claude', version: '2.1.304' },
    });

    expect(await pendingOf(rig, id, 'failure')).toEqual([]);
    expect((await rig.ticket(id)).status).toBe('waiting_human');

    await rig.storage.transaction(async (tx) => {
      await tx.harnessToolSchemas.upsert(tool('read', 'approved'));
      await tx.harnessToolSchemas.upsert(tool('shell', 'approved'));
    });

    await rig.tick();

    expect(rig.driver.starts.length).toBeGreaterThan(startsWhileParked);
    expect((await rig.ticket(id)).status).toBe('in_progress');
  });

  it('stays parked while one tool is still pending', async () => {
    const rig = await makeRig();
    await rig.storage.transaction(async (tx) => {
      await tx.harnessVersions.upsert({
        kind: 'claude',
        version: '2.1.304',
        compat: 'pass',
      });

      await tx.harnessToolSchemas.upsert(tool('read', 'approved'));
      await tx.harnessToolSchemas.upsert(tool('shell', 'pending'));
    });

    const id = await rig.request('Do the thing');
    rig.driver.failNextStart(new HarnessToolsPendingError('2.1.304', ['shell']));
    await rig.tick();
    const before = rig.driver.starts.length;
    await rig.tick();

    expect(rig.driver.starts.length).toBe(before);
    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });
});
