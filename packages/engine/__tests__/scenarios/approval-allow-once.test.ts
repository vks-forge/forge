/**
 * Scenario: a Standard Worker call hits `ask`, the owner allows it once, the same session resumes.
 *
 * Why: before real approvals a refused call was collapsed into a plain denial, the Worker
 *   carried on and finished `success`, and the ticket moved to Verifying with the call never
 *   made. Now the call parks in Needs you, the run can never settle `success` while it is
 *   unanswered, and the owner's answer resumes the same harness session with the answer in the
 *   brief, so the Worker runs the call exactly as before.
 *
 * Pins: raise writes one owner-stage `permission` item with the exact call, a `permission` run
 *   event and card history; a Worker that finishes anyway parks the ticket (waiting_human, never
 *   verifying) and a staged writer does not advance its stage; allow once queues one wake; the
 *   resume is a new run with `retry_of`, the old session and the command named in its brief and
 *   in the Worker contract; the Director and automatic actions cannot answer.
 * Depends on: helpers/approval-rig, helpers/escalation-rig, helpers/rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answer,
  delta,
  idOf,
  permissionsOf,
  raise,
  settleRun1,
  standardTicket,
} from '#tests/helpers/approval-rig.js';
import { cardEventsOf } from '#tests/helpers/escalation-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

const CMD = 'pkg add left-pad';

describe('allow once', () => {
  it('raises one owner-stage item with the call, a run event and a card line', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);

    rig.driver.emit('run-1', { type: 'text', text: 'I need left-pad for the padding.' });
    await rig.flush();
    const out = await raise(rig, CMD, { callId: 'tu-1' });

    expect(out).toMatchObject({ status: 'raised', created: true });
    const [item] = await permissionsOf(rig, id);

    expect(item).toMatchObject({
      kind: 'permission',
      status: 'pending',
      run_id: 'run-1',
      payload: {
        kind: 'permission',
        what: CMD,
        reason_code: 'rule_ask',
        lane: 'standard',
        why: 'I need left-pad for the padding.',
        always: { offered: true },
      },
    });

    expect(item?.escalated_at).toBeDefined();
    expect((await rig.ticket(id)).status).toBe('in_progress');

    const events = await rig.storage.transaction((tx) => tx.runEvents.listByRun('run-1'));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'permission',
        interaction_id: item?.id,
        call_id: 'tu-1',
        decision: 'ask',
      }),
    );

    const card = (await rig.ticket(id)).card_id;
    expect(await cardEventsOf(rig, card, 'interaction_opened')).toHaveLength(1);
    expect(await cardEventsOf(rig, card, 'escalation')).toHaveLength(1);
  });

  it('parks a Worker that finishes anyway: never verifying, the stage does not advance', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    await raise(rig, CMD);

    await settleRun1(rig);

    expect((await rig.ticket(id)).status).toBe('waiting_human');
    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run?.status).toBe('settled');

    const rows = await rig.storage.transaction((tx) => tx.stageRuns.listByTicket(id));
    expect(rows.map((r) => r.status)).not.toContain('passed');
    expect(rig.driver.starts).toHaveLength(1);
  });

  it('resumes the same session once the owner allows it, naming the command', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    await settleRun1(rig);

    const done = await answer(rig, item, 'allow_once');
    expect(done.status).toBe('done');

    const report = await rig.tick();

    expect(report.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'resume' }]);
    const second = await rig.storage.transaction((tx) => tx.runs.get('run-2'));
    expect(second).toMatchObject({ retry_of: 'run-1', status: 'running' });
    expect(rig.driver.starts[1]).toMatchObject({ runId: 'run-2', resume: 'sess-A' });

    const brief = delta(rig, 1);
    expect(brief).toContain('Allowed once');
    expect(brief).toContain(CMD);
    expect(brief).toContain('run it now exactly as before');
    expect(brief).toContain('waiting for the owner');
  });

  it('settles once however often the owner clicks and resumes once', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    await settleRun1(rig);

    await answer(rig, item, 'allow_once');
    const again = await answer(rig, item, 'allow_once');

    expect(again.status).toBe('not_pending');
    const report = await rig.tick();
    expect(report.dispatched).toHaveLength(1);
    expect(await permissionsOf(rig, id)).toHaveLength(1);
  });

  it('refuses the director, the engine and automatic actions', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));

    for (const who of ['director', 'engine', 'auto']) {
      expect(await answer(rig, item, 'allow_once', who)).toEqual({
        status: 'action_not_offered',
      });
    }

    expect((await permissionsOf(rig, id))[0]?.status).toBe('pending');
  });
});
