/**
 * The live facts on ticket list rows: pipeline stage, run in flight, Retry offer.
 *
 * Why: a Board tile says "Stage 2/3 · Review", "run 2 · implementer" and offers Retry without
 *   the web asking per ticket. If the server reported a finished stage as current, counted the
 *   wrong run, called a settled run live, or offered Retry on a question that does not offer it,
 *   the owner would watch the wrong thing or click a button that fails.
 *
 * Pins: stage index, count and label from the ticket's own pipeline copy (the first stage not
 *   passed); run number among the ticket's runs and only for a run still in flight; no stage on
 *   a ticket without a pipeline copy or one that is done; `retry_escalation_id` only on an owner
 *   question that offers retry; card page rows carry the same facts.
 * Depends on: helpers/read-rig, @forge/db (via rig). IO: a loopback socket.
 */

import type { Interaction, TicketPipeline } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

const T = '2026-10-16T00:00:00.000Z';

const snapshot = (id: string): TicketPipeline => ({
  ticket_id: id as TicketPipeline['ticket_id'],
  lane: 'full',
  definition: {
    stages: [
      { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
      { id: 'reviewer', kind: 'agent', label: 'Review and critique', agent: 'reviewer' },
      { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
    ],
  },
  roles: { implementer: 'writer', reviewer: 'reviewer' },
  hash: 'a'.repeat(64),
  base_hash: 'a'.repeat(64),
  config_version: 'c0:p0',
  routed: [],
  adjustments: [],
  created_at: T,
  updated_at: T,
});

interface Row {
  id: string;
  stage?: { index: number; count: number; label: string };
  live_run?: { number: number; agent?: string; started_at: string };
  retry_escalation_id?: string;
}

let t: ReadRig;

const rows = async (path = '/projects/fixture/tickets'): Promise<Map<string, Row>> => {
  const res = await t.rig.json('GET', path);

  return new Map((res.body as { items: Row[] }).items.map((r) => [r.id, r]));
};

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    // FX-1: implementer passed, reviewer running on its second run.
    await tx.tickets.insert(
      makeTicket('FX', 1, {
        status: 'in_progress',
        assignee_run_id: 'run-2',
        lane: 'full',
      }),
    );

    await tx.ticketPipelines.insert(snapshot('FX-1'));
    await tx.runs.insert(
      makeRun('run-1', 'FX-1', { started_at: '2026-10-16T01:00:00.000Z' }),
    );

    await tx.runs.insert(
      makeRun('run-2', 'FX-1', {
        status: 'running',
        agent_id: 'reviewer',
        started_at: '2026-10-16T02:00:00.000Z',
      }),
    );

    await tx.stageRuns.start({
      ticket_id: 'FX-1' as never,
      stage_id: 'implementer',
      member_id: '',
      cycle: 0,
      kind: 'agent',
      status: 'passed',
      started_at: T,
    });

    // FX-2: no pipeline copy yet, a settled run as its assignee.
    await tx.tickets.insert(
      makeTicket('FX', 2, { status: 'in_progress', assignee_run_id: 'run-3' }),
    );

    await tx.runs.insert(makeRun('run-3', 'FX-2', { status: 'success' }));

    // FX-3: done, with a pipeline copy: no stage shown.
    await tx.tickets.insert(makeTicket('FX', 3, { status: 'done', lane: 'full' }));
    await tx.ticketPipelines.insert(snapshot('FX-3'));

    // FX-4 offers Retry through an owner failure; FX-5 asks a question (no retry).
    await tx.tickets.insert(makeTicket('FX', 4, { status: 'waiting_human' }));
    await tx.tickets.insert(makeTicket('FX', 5, { status: 'waiting_human' }));
    const pending = (id: string, ticket: string, payload: unknown, kind: string) =>
      ({
        id,
        ticket_id: ticket,
        kind,
        payload,
        status: 'pending',
        asked_at: T,
        escalated_at: T,
        timeout_at: '9999-12-31T23:59:59.999Z',
      }) as Interaction;

    await tx.interactions.insert(
      pending(
        'int-f',
        'FX-4',
        {
          kind: 'failure',
          cause: 'retry_cap',
          summary: 'crash: failed 2 times',
          attempts: [],
        },
        'failure',
      ),
    );

    await tx.interactions.insert(
      pending('int-q', 'FX-5', { prompt: 'Which database?' }, 'question'),
    );
  });
});

afterEach(async () => {
  await t.close();
});

describe('progress facts on ticket list rows', () => {
  it('reports the stage not yet passed, with its position and label', async () => {
    const row = (await rows()).get('FX-1');

    expect(row?.stage).toEqual({ index: 2, count: 3, label: 'Review and critique' });
  });

  it('numbers the run in flight among the ticket runs and names its agent', async () => {
    const row = (await rows()).get('FX-1');

    expect(row?.live_run).toEqual({
      number: 2,
      agent: 'reviewer',
      started_at: '2026-10-16T02:00:00.000Z',
    });
  });

  it('shows no stage without a pipeline copy or once done, and no live run for a settled run', async () => {
    const all = await rows();

    expect(all.get('FX-2')?.stage).toBeUndefined();
    expect(all.get('FX-2')?.live_run).toBeUndefined();
    expect(all.get('FX-3')?.stage).toBeUndefined();
  });

  it('names the owner question that offers retry, and only that one', async () => {
    const all = await rows();

    expect(all.get('FX-4')?.retry_escalation_id).toBe('int-f');
    expect(all.get('FX-5')?.retry_escalation_id).toBeUndefined();
  });
});
