/**
 * Tracked storage for the Director's pipeline writes: the strip, the Inbox and the Pipelines screens stay live.
 *
 * Why: the ticket page's strip must move when the Director changes the ticket's pipeline copy or the owner marks a
 *   finding, and the Inbox and the Pipelines banner must move when a pipeline proposal is made or decided (a
 *   decided one also changed the lane's settings), all within a second and without any writer remembering to
 *   notify (d-0132). The one storage wrapper announces them under the project's slug, and a rolled-back write
 *   announces nothing.
 *
 * Pins: `ticketPipelines.adjust` and a finding mark set announce `ticket-pipeline:<id>`, `ticket:<id>` and the project's tickets list; a clear
 *   (known only by its row id) the same; a proposal insert announces `pipeline-proposals:<slug>` and `inbox:<slug>`;
 *   a decision also `pipelines:project:<slug>` and `project-settings:<slug>`; a rollback announces nothing.
 * Depends on: src/services/{tracked-storage,project-events}, @forge/db (memory), vitest.
 */

import { BUILTIN_PIPELINES } from '@forge/core';
import type { Ticket, TicketPipeline } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';

const T = '2026-10-18T00:00:00.000Z';
const HASH = 'a'.repeat(64);

const ticket: Ticket = {
  id: 'FX-1' as Ticket['id'],
  project: 'p1',
  title: 't',
  body: 'b',
  type: 'feat',
  lane: 'standard',
  tier_predicted: 'A',
  status: 'verifying',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
};

const snapshot: TicketPipeline = {
  ticket_id: 'FX-1' as TicketPipeline['ticket_id'],
  lane: 'standard',
  definition: BUILTIN_PIPELINES.standard,
  roles: {},
  hash: HASH,
  base_hash: HASH,
  config_version: 'c0:p0',
  routed: [],
  adjustments: [],
  created_at: T,
  updated_at: T,
};

async function setup() {
  const raw = createMemoryStorage();
  const events = createProjectEvents();
  const seen: string[][] = [];
  events.subscribe('dcp', (keys) => seen.push(keys.map((k) => k.join(':')).sort()));
  const row = await raw.transaction(async (tx) => {
    await tx.projects.upsert({
      id: 'p1',
      slug: 'dcp',
      prefix: 'FX',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    });

    await tx.tickets.insert(ticket);
    await tx.ticketPipelines.insert(snapshot);

    return tx.stageRuns.start({
      ticket_id: ticket.id,
      stage_id: 'reviewer',
      member_id: '',
      cycle: 0,
      kind: 'agent',
      status: 'failed',
      outcome: {
        review: {
          verdict: 'changes',
          summary: 's',
          findings: [{ severity: 'high', issue: 'a', evidence: 'x' }],
        },
      },
      started_at: T,
    });
  });

  return { raw, storage: trackProjectWrites(raw, events), seen, row: row as number };
}

const strip = ['ticket-pipeline:FX-1', 'ticket:FX-1', 'tickets:dcp'].sort();

describe('the Director and the owner write to the ticket strip', () => {
  it('announces an adjustment of the pipeline copy', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) =>
      tx.ticketPipelines.adjust('FX-1', {
        definition: BUILTIN_PIPELINES.standard,
        hash: HASH,
        adjustments: [],
        at: T,
      }),
    );

    expect(seen).toEqual([strip]);
  });

  it('announces a mark and, known only by its row id, a clear', async () => {
    const { storage, seen, row } = await setup();

    await storage.transaction((tx) =>
      tx.findingMarks.set({
        ticket_id: 'FX-1',
        stage_run_id: row,
        finding_index: 0,
        verdict: 'real',
        marked_at: T,
      }),
    );

    expect(seen).toEqual([strip]);
    seen.length = 0;

    await storage.transaction((tx) => tx.findingMarks.clear(row, 0));

    expect(seen).toEqual([strip]);
  });

  it('announces nothing for a rolled-back write or a read', async () => {
    const { storage, seen, row } = await setup();

    await expect(
      storage.transaction(async (tx) => {
        await tx.findingMarks.set({
          ticket_id: 'FX-1',
          stage_run_id: row,
          finding_index: 0,
          verdict: 'real',
          marked_at: T,
        });

        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await storage.transaction((tx) => tx.findingMarks.listByTickets(['FX-1']));

    expect(seen).toEqual([]);
  });
});

describe('proposals announce the Inbox and the Pipelines screens', () => {
  const proposal = {
    project: 'dcp',
    lane: 'standard' as const,
    key: 'standard:remove:reviewer',
    base_hash: HASH,
    op: {
      op: 'remove' as const,
      stage_id: 'reviewer',
      reason: 'A typo needs no review.',
    },
    proposed: BUILTIN_PIPELINES.express,
    evidence: [{ ticket_id: 'FX-1' as Ticket['id'], reason: 'A typo needs no review.' }],
    count: 3,
    created_at: T,
  };

  it('announces a new proposal, and a decision with the lane settings too', async () => {
    const { storage, seen } = await setup();
    const id = await storage.transaction((tx) => tx.pipelineProposals.insert(proposal));

    expect(seen).toEqual([['inbox:dcp', 'pipeline-proposals:dcp']]);
    seen.length = 0;

    await storage.transaction((tx) =>
      tx.pipelineProposals.decide(id as number, {
        status: 'rejected',
        reason: 'not now',
        at: T,
      }),
    );

    expect(seen).toEqual([
      [
        'inbox:dcp',
        'pipeline-proposals:dcp',
        'pipelines:project:dcp',
        'project-settings:dcp',
      ].sort(),
    ]);
  });
});
