/**
 * Sample tickets with their runs, gate results and questions, for component tests.
 *
 * Why: the Board and the Ticket page need every state to be seen and tested: a ticket in each
 *   column, one that waits on the user with a real question, one with a run that is still
 *   streaming, one that finished, one that failed a gate. Everything is plainly a sample
 *   (`sample-*` projects, invented titles about an imaginary service) so it cannot be mistaken
 *   for the user's work. Rows are parsed with the real core schemas, so a fixture cannot drift
 *   from the server's shape; a drift fails at load, not in front of a user.
 *
 * Exports: buildSampleTickets().
 * Depends on: @forge/core (Ticket, Run, GateResult, Interaction), helpers/forge-data/ticket-seeds,
 *   helpers/forge-data/ticket-data.types.
 */

import { GateResult, Interaction, Run, Ticket } from '@forge/core';
import { SEEDS, ago } from '#tests/helpers/forge-data/ticket-seeds.js';
import type {
  SampleTicket,
  TicketSeed,
} from '#tests/helpers/forge-data/ticket-data.types.js';

const PROJECT_SLUG: Readonly<Record<string, string>> = {
  'fixture-1': 'sample-service',
  'fixture-2': 'sample-web',
};

function buildRun(seed: TicketSeed, retryOf?: string): Run | null {
  if (!seed.run) {
    return null;
  }

  const finished = seed.run.status !== 'running' && seed.run.status !== 'starting';

  return Run.parse({
    id: seed.run.id,
    ticket_id: seed.id,
    project: PROJECT_SLUG[seed.project],
    harness: seed.run.harness ?? 'claude-code',
    driver_version: '0.1.0',
    cwd: 'sample/workspace',
    lane: seed.lane,
    started_at: ago(seed.updated + 14),
    ...(finished ? { ended_at: ago(seed.updated) } : {}),
    status: seed.run.status,
    ...(seed.run.cost === undefined ? {} : { cost_usd: seed.run.cost }),
    owner: 'sample-owner',
    ...(retryOf ? { retry_of: retryOf } : {}),
  });
}

const GATES_FOR: Readonly<Record<string, readonly [string, string][]>> = {
  'SVC-1': [
    ['G1', 'passed'],
    ['G2', 'passed'],
    ['G3', 'passed'],
  ],
  'SVC-2': [
    ['G1', 'passed'],
    ['G2', 'passed'],
  ],
  'SVC-5': [
    ['G1', 'passed'],
    ['G2', 'passed'],
    ['G3', 'passed'],
    ['G4', 'skipped'],
  ],
  'SVC-8': [
    ['G1', 'passed'],
    ['G2', 'failed'],
  ],
  'SVC-11': [
    ['G1', 'passed'],
    ['G2', 'passed'],
    ['G3', 'passed'],
  ],
};

function buildGates(seed: TicketSeed): GateResult[] {
  const rows = GATES_FOR[seed.id] ?? [];

  return rows.map(([gate, status], index) =>
    GateResult.parse({
      id: index + 1,
      run_id: seed.run?.id ?? 'run-unknown',
      gate,
      status,
      started_at: ago(seed.updated + 8),
      ended_at: ago(seed.updated + 6),
    }),
  );
}

/** Every sample ticket with its detail, in no particular order. */
export function buildSampleTickets(): SampleTicket[] {
  return SEEDS.map((seed) => {
    const run = buildRun(seed, seed.id === 'SVC-8' ? 'run-svc-8a' : undefined);
    // SVC-8 was reworked once: an earlier run failed its gate and the second run retried it.
    const earlier =
      seed.id === 'SVC-8'
        ? buildRun({ ...seed, run: { id: 'run-svc-8a', status: 'success' }, updated: 90 })
        : null;

    const question = seed.id === 'SVC-4';

    return {
      ticket: Ticket.parse({
        id: seed.id,
        project: seed.project,
        title: seed.title,
        body: `Sample request for ${seed.id}.`,
        type: 'feat',
        lane: seed.lane,
        tier_predicted: seed.lane === 'full' ? 'C' : 'A',
        status: seed.status,
        status_version: 1,
        rework_count: seed.rework ?? 0,
        priority: 0,
        ...(seed.blocked ? { blocked_reason: seed.blocked } : {}),
        ...(seed.run && seed.status !== 'done' ? { assignee_run_id: seed.run.id } : {}),
        ...(seed.pr
          ? {
              pr_number: seed.pr,
              pr_url: `https://example.com/sample/service/pull/${seed.pr}`,
            }
          : {}),
        created_at: ago(seed.updated + 60),
        updated_at: ago(seed.updated),
        blocked_by: seed.id === 'SVC-9' ? ['SVC-5'] : [],
      }),
      runs: [run, earlier].filter((r): r is Run => r !== null),
      gates: buildGates(seed),
      interactions: question
        ? [
            Interaction.parse({
              id: 'int-svc-4',
              ticket_id: seed.id,
              run_id: 'run-svc-4',
              kind: 'question',
              payload: {
                prompt: 'Should the report window use UTC or the account time zone?',
              },
              status: 'pending',
              asked_at: ago(12),
              timeout_at: ago(-60 * 24),
            }),
          ]
        : [],
      waitReason: seed.status === 'planned' ? 'cap: per-project 1/1' : null,
    };
  });
}
