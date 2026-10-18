/**
 * Tracked storage for stage writes: the live strip on the ticket page.
 *
 * Why: the ticket page draws its pipeline strip from `["ticket-pipeline", id]`, and the strip must
 *   move as the stages do (a gate passed, the Director check running, a sign-off waiting) within a
 *   second, without anyone remembering to notify. Stage rows are written by the engine in many
 *   places, so the one storage wrapper announces them: a pipeline snapshot, a stage row started or
 *   finished (a finish only knows the row's id, so its ticket is looked up before the commit) and a
 *   stage artifact each announce the strip and the ticket page, under the project's slug. A rolled
 *   back write announces nothing.
 *
 * Pins: snapshot insert, replace and routed append; stage row start and finish; artifact add; each
 *   announces `ticket-pipeline:<id>` and `ticket:<id>` for the project slug; a rollback announces
 *   nothing; reads announce nothing.
 * Depends on: src/services/{tracked-storage,project-events}, @forge/db (memory), vitest.
 */

import type { Ticket, TicketPipeline } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';

const T = '2026-10-18T00:00:00.000Z';

const ticket = (n: number): Ticket => ({
  id: `FX-${n}` as Ticket['id'],
  project: 'p1',
  title: 't',
  body: 'b',
  type: 'feat',
  lane: 'full',
  tier_predicted: 'A',
  status: 'verifying',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
});

const snapshot = (id: string): TicketPipeline => ({
  ticket_id: id as TicketPipeline['ticket_id'],
  lane: 'full',
  definition: {
    stages: [
      { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
      { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
    ],
  },
  roles: { implementer: 'writer' },
  hash: 'a'.repeat(64),
  config_version: 'c0:p0',
  routed: [],
  created_at: T,
  updated_at: T,
});

async function setup() {
  const raw = createMemoryStorage();
  const events = createProjectEvents();
  const seen: string[][] = [];
  events.subscribe('dcp', (keys) => seen.push(keys.map((k) => k.join(':'))));
  await raw.transaction(async (tx) => {
    await tx.projects.upsert({
      id: 'p1',
      slug: 'dcp',
      prefix: 'FX',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    });

    await tx.tickets.insert(ticket(1));
  });

  return { raw, storage: trackProjectWrites(raw, events), seen };
}

const strip = ['ticket-pipeline:FX-1', 'ticket:FX-1'];

describe('stage writes announce the ticket strip', () => {
  it('announces a pipeline snapshot insert and replace', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) => tx.ticketPipelines.insert(snapshot('FX-1')));
    await storage.transaction((tx) => tx.ticketPipelines.replace(snapshot('FX-1')));

    expect(seen).toEqual([strip, strip]);
  });

  it('announces a stage row start and, resolved by its id, a finish', async () => {
    const { storage, seen } = await setup();
    const id = await storage.transaction((tx) =>
      tx.stageRuns.start({
        ticket_id: 'FX-1' as Ticket['id'],
        stage_id: 'implementer',
        member_id: '',
        cycle: 0,
        kind: 'agent',
        status: 'running',
        started_at: T,
      }),
    );

    expect(seen).toEqual([strip]);
    seen.length = 0;

    await storage.transaction((tx) =>
      tx.stageRuns.finish(id as number, { status: 'passed', ended_at: T }),
    );

    expect(seen).toEqual([strip]);
  });

  it('announces a stage artifact', async () => {
    const { storage, raw, seen } = await setup();
    const id = await raw.transaction((tx) =>
      tx.stageRuns.start({
        ticket_id: 'FX-1' as Ticket['id'],
        stage_id: 'implementer',
        member_id: '',
        cycle: 0,
        kind: 'agent',
        status: 'running',
        started_at: T,
      }),
    );

    await storage.transaction((tx) =>
      tx.stageArtifacts.add({
        ticket_id: 'FX-1' as Ticket['id'],
        stage_run_id: id as number,
        kind: 'check_report',
        content: '{}',
        truncated: false,
        sha256: 'b'.repeat(64),
        created_at: T,
      }),
    );

    expect(seen).toEqual([strip]);
  });

  it('announces nothing for a read or a rolled-back write', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) => tx.stageRuns.listByTicket('FX-1'));
    await expect(
      storage.transaction(async (tx) => {
        await tx.ticketPipelines.insert(snapshot('FX-1'));
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');

    expect(seen).toEqual([]);
  });
});
