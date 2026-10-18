/**
 * Pins the Director check stage: what it reads, what it stores, how it blocks, how it survives a restart.
 *
 * Why: the check against the plan is the one judge in the Full lane that knows what the ticket was
 *   supposed to do, and it must be independent of the Worker, auditable by the owner and safe when
 *   the server stops. It reads typed artifacts only, so the Worker's own story and its self-reported
 *   claims are never in the step input; an unmet criterion must be able to hold the merge and an
 *   unconfirmed one must keep the Director from signing; what it was shown and what it answered are
 *   stored on the stage row for the owner to read; its cost counts toward the card's budget as a
 *   warning and never blocks; and a job that died with the process is asked again without a second
 *   stage row.
 *
 * Pins: the step input holds no narrative or finish_claims whatever the Worker wrote, and holds the
 *   plan's acceptance and the diff; an unmet criterion becomes a high finding and holds the ticket
 *   (the Director check defaults to hold) with a findings_hold decision on `check-plan`; an unclear
 *   criterion does not block but leaves the signature to the owner; the shown artifacts and a
 *   `check_report` are stored; a restart mid-check gives one row and a finished ticket.
 * Depends on: helpers/full-rig, helpers/pipeline-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  makeFullRig,
  passChecks,
  pendingItem,
  toChecks,
} from '#tests/helpers/full-rig.js';
import { review, reviewDone, stageRows } from '#tests/helpers/pipeline-rig.js';

const NARRATIVE = 'SENTINEL-NARRATIVE-42 I changed everything and it is perfect';
const CLAIM_FILE = 'src/SENTINEL-CLAIMED-FILE.ts';

describe('what the Director check is shown', () => {
  it('never holds the Worker narrative or its claims, and holds the plan and the diff', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    rig.worktrees.patch = 'diff --git a/src/a.ts b/src/a.ts\n+the real change';
    await toChecks(v, {
      sentinel: NARRATIVE,
      plan: { acceptance: ['lists open tickets'] },
    });

    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    // The Worker's claims name a file the diff does not touch.
    await rig.storage.transaction(async (tx) => {
      await tx.runEvents.append('run-2', {
        type: 'finish',
        ts: new Date(rig.clock.now()).toISOString(),
        summary: NARRATIVE,
        structured: { claims: [{ kind: 'edited', path: CLAIM_FILE }] },
      });
    });

    await passChecks(v);
    const [call] = rig.llm.callsTo('ticket_check');
    const text = JSON.stringify(call?.input);

    expect(text).toContain('lists open tickets');
    expect(text).toContain('+the real change');
    expect(text).not.toContain('SENTINEL');
    expect(text).not.toContain(CLAIM_FILE);
    const kinds = (call?.input['artifacts'] as { kind: string }[]).map((a) => a.kind);

    expect(kinds).not.toContain('narrative');
    expect(kinds).not.toContain('finish_claims');
  });

  it('stores what it was shown and its own report on the stage row', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    const id = await toChecks(v);
    await passChecks(v);

    const rows = await stageRows(rig, id);
    const row = rows.find((r) => r.stage_id === 'check-plan');
    const artifacts = (
      await rig.storage.transaction((tx) => tx.stageArtifacts.listByTicket(id))
    ).filter((a) => a.stage_run_id === row?.id);

    expect(artifacts.map((a) => a.kind)).toEqual(
      expect.arrayContaining(['ticket', 'plan', 'check_report']),
    );

    expect(artifacts.map((a) => a.kind)).not.toContain('narrative');
    expect(row?.outcome.check).toMatchObject({ verdict: 'pass' });
  });
});

describe('what the Director check blocks', () => {
  it('holds the ticket on an unmet criterion with a high finding on the check-plan stage', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    rig.llm.script('ticket_check', {
      verdict: 'changes',
      summary: 'The pagination criterion is not met.',
      acceptance: [
        {
          criterion: 'paginates the list',
          met: 'no',
          evidence: 'no paging code in the diff',
        },
      ],
      findings: [],
      confidence: 0.8,
    });

    const id = await toChecks(v);
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    await reviewDone(rig, 'run-4', review('pass'));
    for (let i = 0; i < 4; i++) {
      await rig.tick();
      await rig.flush();
    }

    const item = await pendingItem(v, id, 'decision');
    expect(await rig.ticket(id)).toMatchObject({
      status: 'waiting_human',
      rework_count: 0,
    });

    expect(item?.payload).toMatchObject({
      kind: 'decision',
      cause: 'findings_hold',
      stage_id: 'check-plan',
      findings: [
        { severity: 'high', issue: expect.stringContaining('paginates the list') },
      ],
    });

    expect(host.count('merge')).toBe(0);
    expect(
      (await stageRows(rig, id)).find((r) => r.stage_id === 'check-plan'),
    ).toMatchObject({
      kind: 'director',
      status: 'waiting',
    });
  });

  it('lets an unclear criterion through but leaves the signature to the owner', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    rig.llm.script('ticket_check', {
      verdict: 'pass',
      summary: 'Mostly fine.',
      acceptance: [
        { criterion: 'is fast', met: 'unclear', evidence: 'no benchmark in the diff' },
      ],
      findings: [],
      confidence: 0.6,
    });

    const id = await toChecks(v);
    await passChecks(v);

    expect(await rig.ticket(id)).toMatchObject({ status: 'review' });
    expect(await pendingItem(v, id, 'sign_off')).toMatchObject({
      payload: { cause: 'director_declined' },
    });

    const row = (await stageRows(rig, id)).find((r) => r.stage_id === 'check-plan');

    expect(row?.status).toBe('passed');
    expect(row?.outcome.review?.findings.map((f) => f.severity)).toEqual(['medium']);
  });

  it('counts its cost toward the card budget and never blocks on it', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    rig.llm.cost('ticket_check', 0.37);
    const id = await toChecks(v);
    await passChecks(v);

    const card = (await rig.ticket(id)).card_id;
    const planning = await rig.storage.transaction((tx) =>
      tx.cardPlanning.get(card as never),
    );

    expect(planning.grill.director_spend_usd).toBeGreaterThanOrEqual(0.37);
    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
  });
});

describe('restart during the Director check', () => {
  it('asks the step again for a job that died with the process, with one stage row and a finished ticket', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    const id = await toChecks(v);
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    await reviewDone(rig, 'run-4', review('pass'));
    // This tick starts the check as a job; the process then dies before it is applied.
    await rig.tick();

    const running = (await stageRows(rig, id)).find((r) => r.stage_id === 'check-plan');
    expect(running?.status).toBe('running');
    const before = rig.llm.callsTo('ticket_check').length;

    const b = rig.restart('srv-b');
    for (let i = 0; i < 4; i++) {
      await rig.tickOn(b);
      await rig.flush();
    }

    expect(rig.llm.callsTo('ticket_check').length).toBe(before + 1);
    const rows = (await stageRows(rig, id)).filter((r) => r.stage_id === 'check-plan');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: running?.id, status: 'passed' });
    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
  });
});
