/**
 * Scenario: a Worker that runs out of turns is parked once, with the limit named for the owner.
 *
 * Why: the eval ticket that hit its turn limit was read as an unknown failure, retried once (a wasted run that hit
 *   the limit again) and parked with "failed 2 times", and the Director's first look got no error text at all. A turn
 *   limit is not a crash: a retry cannot change it, so the ticket parks on the first hit with the number in the
 *   summary, the failure carries the limit and the screen that raises it, and the Director's look gets the run's
 *   last error as data.
 *
 * Pins: no retry for max_turns, the park summary names the turns, the failure payload carries
 *   `limit {kind, value, source, fix_href}`, and the recover step's facts include `last_error` (clipped).
 * Depends on: helpers/escalation-rig, helpers/rig, helpers/scripted-driver, vitest.
 */

import { describe, expect, it } from 'vitest';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const ESCALATE = {
  decision: 'escalate',
  diagnosis: 'The Worker ran out of turns on work that looks too big.',
  confidence: 0.6,
};

describe('a run that hits the turn limit', () => {
  it('parks at once with the limit in the payload and the last error in the Director facts', async () => {
    const rig = await makeRig();
    rig.llm.script('ticket_recover', ESCALATE);

    const id = await rig.request('Do the thing');
    await rig.tick();

    const message = `Reached maximum number of turns (40) ${'x'.repeat(400)}`;
    rig.driver.emit('run-1', { type: 'error', family: 'unknown', message });
    rig.driver.finish('run-1', makeResult({ status: 'max_turns', session: null }));
    await rig.flush();
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
    const [row] = await pendingOf(rig, id, 'failure');
    expect(row!.payload).toMatchObject({
      kind: 'failure',
      cause: 'max_turns',
      summary: 'max_turns: the run used all 40 turns without finishing',
      limit: {
        kind: 'turns',
        value: 40,
        source: 'forge',
        fix_href: '/settings/limits#spend',
      },
    });

    const facts = rig.llm.callsTo('ticket_recover')[0]!.input as {
      failure: { last_error?: string };
    };

    expect(facts.failure.last_error).toMatch(/^Reached maximum number of turns \(40\)/);
    expect(facts.failure.last_error!.length).toBeLessThanOrEqual(300);
  });
});
