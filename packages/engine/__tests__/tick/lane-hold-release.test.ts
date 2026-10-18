/**
 * Pins that a ticket held for a lane that has since gone live is released by the engine itself.
 *
 * Why: before a lane had a pipeline runner, every ticket of it was parked with a lane-hold
 *   escalation and waited for the owner to run it as Express. Tickets already parked that way
 *   must not stay stuck once the lane is live: the owner would otherwise have to find and click
 *   each one, and a person-only way out of a state the system can leave on its own is a dead end
 *   (d-0135). Standard went live first, and Full now runs too (its Director check and sign-off),
 *   so a Full ticket held by an earlier build resumes by itself.
 *
 * Pins: a Standard hold and a Full hold are each settled `pipeline_ready` by `auto`, the ticket is
 *   released through `transition()` and dispatched to the test-writer; releasing is once only;
 *   a hold on a ticket that is not waiting is left alone.
 * Depends on: helpers/rig, @forge/core, vitest.
 */

import type { Interaction, Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const at = (rig: Rig): string => new Date(rig.clock.now()).toISOString();

/** A ticket parked from `planned` for `lane`, with the lane-hold escalation the owner would see. */
async function held(rig: Rig, n: number, lane: Ticket['lane']): Promise<string> {
  const id = `FG-${n}`;
  const now = at(rig);
  await rig.storage.transaction(async (tx) => {
    await tx.tickets.insert({
      id: id as Ticket['id'],
      project: 'forge',
      title: `Held ${lane} ticket`,
      body: 'Do the held thing',
      type: 'feat',
      lane,
      tier_predicted: 'A',
      status: 'waiting_human',
      status_version: 3,
      rework_count: 0,
      priority: 0,
      blocked_reason: `pipeline_pending: the ${lane} lane has no pipeline yet`,
      created_at: now,
      updated_at: now,
      blocked_by: [],
    });

    await tx.interactions.insert({
      id: `int-hold-${n}`,
      ticket_id: id,
      kind: 'failure',
      payload: {
        kind: 'failure',
        cause: 'lane_hold',
        summary: `the ${lane} lane has no pipeline yet`,
        attempts: [],
        lane,
      },
      status: 'pending',
      asked_at: now,
      escalated_at: now,
      timeout_at: '9999-12-31T00:00:00.000Z',
    });
  });

  return id;
}

const interaction = (rig: Rig, id: string): Promise<Interaction | null> =>
  rig.storage.transaction((tx) => tx.interactions.get(id));

describe('lane holds lift when the lane goes live', () => {
  it('settles a Standard hold as pipeline_ready, releases the ticket and starts its first stage', async () => {
    const rig = await makeRig();
    const id = await held(rig, 1, 'standard');

    await rig.tick();

    const row = await interaction(rig, 'int-hold-1');
    expect(row?.status).toBe('answered');
    expect(row?.answer).toMatchObject({ action: 'pipeline_ready', by: 'auto' });
    expect((await rig.ticket(id)).status).toBe('in_progress');
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run?.agent_id).toBe('test-writer');
  });

  it('settles a Full hold as pipeline_ready too: Full runs now, and its first stage starts', async () => {
    const rig = await makeRig();
    const id = await held(rig, 2, 'full');

    await rig.tick();

    const row = await interaction(rig, 'int-hold-2');
    expect(row?.status).toBe('answered');
    expect(row?.answer).toMatchObject({ action: 'pipeline_ready', by: 'auto' });
    expect((await rig.ticket(id)).status).toBe('in_progress');
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run?.agent_id).toBe('test-writer');
  });

  it('releases each hold once: a second tick changes nothing more', async () => {
    const rig = await makeRig();
    await held(rig, 3, 'standard');

    await rig.tick();
    const events = await rig.storage.transaction((tx) => tx.runEvents.listByRun('run-1'));
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
    expect(
      await rig.storage.transaction((tx) => tx.runEvents.listByRun('run-1')),
    ).toEqual(events);
  });
});
