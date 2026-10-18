/**
 * Pins `submit_review` and the narrowing of `get_ticket` for check agents.
 *
 * Why: a reviewer's review reaches the engine only as a typed event, so a finding with no
 *   evidence must never be stored (it could send work back on an unsupported claim), and the last
 *   call must be the one that stands. A reviewer must also not be able to read the ticket's runs,
 *   which would lead it to the writer's own account of the work; a writer-group member sees only
 *   its own run, not its siblings'; a plain writer and a run with no stage row keep them all.
 *
 * Pins: the review run event, refusal of a finding without evidence, last call wins, `runs`
 *   omitted for reviewer/researcher stage runs and for a run whose role is unknown, kept for a
 *   writer stage run and a run with no stage row; a group member sees only its own run.
 * Depends on: helpers/harness, helpers/auto-close, @forge/core, @forge/db.
 */

import type { StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { RUN_ID, T0, TICKET_ID, connect, run, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

const finding = {
  severity: 'high',
  file: 'src/a.ts',
  line: 3,
  issue: 'missing null check',
  evidence: 'const x = a.b.c; // a may be undefined',
};

async function setup() {
  const c = await connect();
  closer.set(c.close);

  return c;
}

async function seedStage(
  storage: StorageAdapter,
  agent: string,
  roles: Record<string, 'writer' | 'reviewer' | 'researcher' | 'tester'>,
  memberId = '',
): Promise<void> {
  await storage.transaction(async (tx) => {
    await tx.ticketPipelines.insert({
      ticket_id: TICKET_ID,
      lane: 'standard',
      definition: {
        stages: [
          { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
          { id: 'g1', kind: 'script_gate', label: 'G1', run: { builtin: 'g1' } },
        ],
      },
      roles,
      hash: 'a'.repeat(64),
      config_version: 'c1:p0',
      routed: [],
      created_at: T0,
      updated_at: T0,
    });

    await tx.stageRuns.start({
      ticket_id: TICKET_ID,
      stage_id: 'reviewer',
      member_id: memberId,
      cycle: 0,
      kind: 'agent',
      agent_id: agent,
      run_id: RUN_ID,
      status: 'running',
      started_at: T0,
    });
  });
}

const runsOf = async (client: Awaited<ReturnType<typeof setup>>['client']) =>
  JSON.parse(
    textOf(await client.callTool({ name: 'get_ticket', arguments: { id: TICKET_ID } })),
  ) as { runs?: unknown };

describe('submit_review', () => {
  it('stores the review as a run event', async () => {
    const { client, storage } = await setup();

    const res = await client.callTool({
      name: 'submit_review',
      arguments: { verdict: 'changes', summary: 'one bug', findings: [finding] },
    });

    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(JSON.parse(textOf(res))).toEqual({ recorded: true, findings: 1 });
    expect(events.at(-1)).toMatchObject({
      type: 'review',
      review: { verdict: 'changes', findings: [finding] },
    });
  });

  it('refuses a finding with no evidence and stores nothing', async () => {
    const { client, storage } = await setup();

    const res = await client.callTool({
      name: 'submit_review',
      arguments: {
        verdict: 'changes',
        summary: 's',
        findings: [{ severity: 'high', issue: 'bad' }],
      },
    });

    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(res.isError).toBe(true);
    expect(events.filter((e) => e.type === 'review')).toEqual([]);
  });

  it('keeps every call as an event so the last one stands for readers', async () => {
    const { client, storage } = await setup();
    await client.callTool({
      name: 'submit_review',
      arguments: { verdict: 'changes', summary: 'first', findings: [finding] },
    });

    await client.callTool({
      name: 'submit_review',
      arguments: { verdict: 'pass', summary: 'second', findings: [] },
    });

    const reviews = (
      await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID))
    ).filter((e) => e.type === 'review');

    expect(reviews).toHaveLength(2);
    expect(reviews.at(-1)).toMatchObject({ review: { summary: 'second' } });
  });
});

describe('get_ticket for check runs', () => {
  it.each(['reviewer', 'researcher'] as const)(
    'omits runs for a %s stage run',
    async (role) => {
      const { client, storage } = await setup();
      await seedStage(storage, 'rev', { rev: role });

      const body = await runsOf(client);

      expect('runs' in body).toBe(false);
    },
  );

  it('omits runs when the stage row exists but the role cannot be told', async () => {
    const { client, storage } = await setup();
    await seedStage(storage, 'ghost', { rev: 'reviewer' });

    expect('runs' in (await runsOf(client))).toBe(false);
  });

  it('keeps runs for a writer stage run', async () => {
    const { client, storage } = await setup();
    await seedStage(storage, 'impl', { impl: 'writer' });

    expect((await runsOf(client)).runs).toEqual([
      expect.objectContaining({ id: RUN_ID }),
    ]);
  });

  it('keeps runs for a run with no stage row', async () => {
    const { client } = await setup();

    expect((await runsOf(client)).runs).toEqual([
      expect.objectContaining({ id: RUN_ID }),
    ]);
  });

  it('shows a writer-group member only its own run, not its siblings', async () => {
    const { client, storage } = await setup();
    await seedStage(storage, 'impl', { impl: 'writer' }, 'm1');
    await storage.transaction((tx) => tx.runs.insert(run({ id: 'run-sibling' })));

    expect((await runsOf(client)).runs).toEqual([
      expect.objectContaining({ id: RUN_ID }),
    ]);
  });

  it('shows a plain writer (no member id) every run of the ticket', async () => {
    const { client, storage } = await setup();
    await seedStage(storage, 'impl', { impl: 'writer' });
    await storage.transaction((tx) => tx.runs.insert(run({ id: 'run-sibling' })));

    const ids = ((await runsOf(client)).runs as { id: string }[]).map((r) => r.id);

    expect(ids.sort()).toEqual(['run-1', 'run-sibling']);
  });

  it('still shows a check run no runs even when it carries a member id', async () => {
    const { client, storage } = await setup();
    await seedStage(storage, 'rev', { rev: 'reviewer' }, 'm1');

    expect('runs' in (await runsOf(client))).toBe(false);
  });
});
