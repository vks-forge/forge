/**
 * Scenario: a Director step that is still thinking never holds up the rest of the tick.
 *
 * Why: a planning turn is several slow model calls. When the tick awaited them, one card's
 *   survey kept every other ticket from settling, being stall-checked or starting its Worker
 *   until the turn ended (eval fix 5). Card turns now run as jobs beside the tick; this pins
 *   that the work of other tickets, in other projects, goes on while a step is pending.
 *
 * Pins: a planned ticket of another project is briefed and starts its run while card A's
 *   planning step is pending (triage, the brief and the launch each take a tick); a run that finished while a step is pending settles in the same tick; the pending
 *   turn still completes once released and the card moves on.
 * Depends on: helpers/hang-step, helpers/planning-rig, helpers/rig, @forge/core, vitest.
 */

import { ProjectConfig } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createFakeWorktrees } from '#tests/helpers/fakes.js';
import { hangStep } from '#tests/helpers/hang-step.js';
import {
  cardOf,
  createPlanCard,
  eventsOf,
  planningRig,
} from '#tests/helpers/planning-rig.js';
import { intake } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

/** Seeds the `api` project with its own worktrees. */
async function addApi(rig: Rig): Promise<void> {
  await rig.seedProject({ id: 'api', slug: 'api', prefix: 'AP' });
  rig.runtimes.set('api', {
    ...rig.runtime.current!,
    config: ProjectConfig.parse({
      slug: 'api',
      prefix: 'AP',
      profile: 'generic',
      default_harness: 'claude-code',
    }),
    worktrees: createFakeWorktrees(),
    baseRef: 'main',
  });
}

const apiRequest = (rig: Rig, text: string) =>
  rig.engine.ingest(
    intake({ project: 'api', payload: { text, card_type: 'pr_issue' } }, rig.clock.now()),
  );

describe('Director steps beside the tick', () => {
  it("starts another project's Worker while a card's planning step is still pending", async () => {
    const rig = await planningRig();
    await addApi(rig);
    const survey = hangStep(rig, 'card_survey');
    const cardId = await createPlanCard(rig);
    await apiRequest(rig, 'api work');

    // Tick 1 starts the card's turn and the ticket's triage; tick 2 applies the triage and starts
    // the brief; tick 3 launches the run. The survey stays pending throughout.
    await rig.engine.tick();
    await rig.flush();
    await rig.engine.tick();
    await rig.flush();
    const report = await rig.engine.tick();

    expect(survey.started).toBe(1);
    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['AP-1']);
    expect(rig.driver.starts).toHaveLength(1);
    expect(rig.engine.directorJobsInFlight()).toBe(1);
    expect((await cardOf(rig, cardId)).phase).toBe('grilling');

    survey.releaseAll();
    await rig.tick();

    expect(rig.engine.directorJobsInFlight()).toBe(0);
    expect((await eventsOf(rig, cardId, 'step_finished')).length).toBeGreaterThan(0);
  });

  it('settles a finished run in the same tick while a Director step is pending', async () => {
    const rig = await planningRig();
    const ticketId = await rig.request('quick fix');
    await rig.tick();
    const runId = rig.driver.starts[0]!.runId;

    const survey = hangStep(rig, 'card_survey');
    await createPlanCard(rig);
    rig.driver.finish(runId, makeResult());
    await rig.flush();

    const report = await rig.engine.tick();

    expect(survey.started).toBe(1);
    expect(report.settled.map((s) => s.ticketId)).toContain(ticketId);
    expect((await rig.ticket(ticketId)).status).not.toBe('in_progress');

    survey.releaseAll();
    await rig.tick();
  });
});
