/**
 * Scenario: triage decides the lane, M0 runs only Express, and a bad model answer is contained.
 *
 * Why: triage is the gate between "someone asked" and "a Worker spends money". In M0 only
 *   the Express lane is wired, so any ticket the rules put in a heavier lane must stop in
 *   front of a human with a plain reason, not run with too little process (d-0059, brief
 *   E1). And because the model can answer off-schema or be down, a bad answer is retried
 *   once with the validation error, then rejected without writing anything, and not
 *   re-spent on every tick.
 *
 * Pins: the requester's hint, title and type survive a restart (read from the stored intake
 *   event); a Standard or Full lane parks the ticket in waiting_human with "lane not enabled in
 *   M0" and starts nothing; low confidence moves Express to Standard and parks; a quick hint
 *   on a clean ticket runs as Express; a predicted tier-C path parks as Full; invalid output
 *   is retried once with previous_error and then used; invalid twice is rejected, logged,
 *   leaves the ticket in the inbox and is held off until the next window; a rate-limited step
 *   waits for its reset time.
 * Depends on: helpers/rig, helpers/scripted-llm, vitest.
 */

import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';

const triageAnswer = (over: Record<string, unknown> = {}) => ({
  lane: 'express',
  confidence: 0.9,
  predicted_files: ['src/a.ts'],
  questions: [],
  type: 'fix',
  tier_predicted: 'A',
  title: 'Scripted triage title',
  ...over,
});

describe('non-Express lanes are parked in M0', () => {
  it.each(['standard', 'full'] as const)(
    'parks a %s ticket with a clear reason and starts nothing',
    async (lane) => {
      const rig = await makeRig();
      rig.llm.script('triage', triageAnswer({ lane }));
      const id = await rig.request('Rework the whole thing');

      const report = await rig.tick();

      expect(report.triaged).toEqual([{ ticketId: id, lane, parked: true }]);
      expect(report.parked).toEqual([
        { ticketId: id, reason: expect.stringContaining('lane not enabled in M0') },
      ]);

      const t = await rig.ticket(id);
      expect(t).toMatchObject({ status: 'waiting_human', lane });
      expect(t.blocked_reason).toContain('lane not enabled in M0');
      expect(rig.driver.starts).toEqual([]);
      expect(rig.worktrees.created).toEqual([]);
      expect(report.violations).toEqual([]);
    },
  );

  it('moves a low-confidence Express proposal one lane up and parks it', async () => {
    const rig = await makeRig();
    rig.llm.script('triage', triageAnswer({ confidence: 0.4 }));
    const id = await rig.request('Maybe a small thing');
    const report = await rig.tick();
    expect(report.triaged).toEqual([{ ticketId: id, lane: 'standard', parked: true }]);
  });

  it('parks a ticket whose predicted files touch a tier-C path as Full, tier C', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { tier_c_globs: ['**/auth/**'] },
      author: 'test',
      reason: 'tier C paths',
      expectedVersion: 0,
    });

    rig.llm.script('triage', triageAnswer({ predicted_files: ['src/auth/login.ts'] }));
    const id = await rig.request('Tweak login');
    const report = await rig.tick();
    expect(report.triaged).toEqual([{ ticketId: id, lane: 'full', parked: true }]);
    expect(await rig.ticket(id)).toMatchObject({ lane: 'full', tier_predicted: 'C' });
  });

  it('runs a clean "quick" request as Express even when the model is unsure', async () => {
    const rig = await makeRig();
    rig.llm.script('triage', triageAnswer({ lane: 'standard', confidence: 0.2 }));
    const id = await rig.request('Fix typo', { hint: 'quick' });
    const report = await rig.tick();
    expect(report.triaged).toEqual([{ ticketId: id, lane: 'express', parked: false }]);
    expect(report.dispatched).toHaveLength(1);
  });

  it('still honours a "quick" hint after a server restart before triage', async () => {
    const rig = await makeRig();
    rig.llm.script('triage', triageAnswer({ lane: 'standard', confidence: 0.2 }));
    const id = await rig.request('Fix typo', {
      hint: 'quick',
      title: 'Mine',
      type: 'docs',
    });

    const report = await rig.restart('srv-b').tick();

    expect(report.triaged).toEqual([{ ticketId: id, lane: 'express', parked: false }]);
    expect(await rig.ticket(id)).toMatchObject({ title: 'Mine', type: 'docs' });
  });

  it('lets the requester name the title and type, over the model', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix typo', { title: 'My own title', type: 'docs' });
    await rig.tick();
    expect(await rig.ticket(id)).toMatchObject({ title: 'My own title', type: 'docs' });
  });
});

describe('invalid step output', () => {
  it('retries once with the validation error, then uses the corrected answer', async () => {
    const rig = await makeRig();
    rig.llm.script('triage', { nonsense: true }, triageAnswer());
    await rig.request('Fix it');

    const report = await rig.tick();

    const calls = rig.llm.callsTo('triage');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.input).not.toHaveProperty('previous_error');
    expect(calls[1]!.input).toHaveProperty('previous_error');
    expect(report.rejectedSteps).toEqual([]);
    expect(report.dispatched).toHaveLength(1);
  });

  it('rejects after the retry: logged, no state written, held off until the next window', async () => {
    const rig = await makeRig();
    rig.llm.script('triage', { nonsense: true });
    const id = await rig.request('Fix it');
    const before = await rig.ticket(id);

    const first = await rig.tick();

    expect(rig.llm.callsTo('triage')).toHaveLength(2);
    expect(first.rejectedSteps).toEqual([
      { step: 'triage', ticketId: id, reason: expect.stringContaining('invalid_output') },
    ]);

    expect(
      rig.logs.some((l) => l.level === 'warn' && l.message.includes('triage rejected')),
    ).toBe(true);

    expect(await rig.ticket(id)).toEqual(before);

    await rig.tick();
    expect(rig.llm.callsTo('triage')).toHaveLength(2);

    rig.clock.advance(31_000);
    rig.llm.script('triage', triageAnswer());
    expect((await rig.tick()).dispatched).toHaveLength(1);
  });

  it('does not retry a model error that is not an off-schema answer, and waits for its reset', async () => {
    const rig = await makeRig();
    const reset = new Date(rig.clock.now() + 120_000).toISOString();
    rig.llm.script(
      'triage',
      fail({ kind: 'rate_limit', message: '429', retryNotBefore: reset }),
    );

    await rig.request('Fix it');

    const first = await rig.tick();
    expect(rig.llm.callsTo('triage')).toHaveLength(1);
    expect(first.rejectedSteps[0]).toMatchObject({ step: 'triage' });

    rig.clock.advance(100_000);
    await rig.tick();
    expect(rig.llm.callsTo('triage')).toHaveLength(1);

    rig.clock.advance(20_001);
    rig.llm.script('triage', triageAnswer());
    expect((await rig.tick()).dispatched).toHaveLength(1);
  });

  it('holds the ticket in planned when the prompt step is rejected, and writes no run', async () => {
    const rig = await makeRig();
    rig.llm.script('dispatch_prompt', { prompt: '' });
    const id = await rig.request('Fix it');

    const report = await rig.tick();

    expect(report.rejectedSteps).toEqual([
      expect.objectContaining({ step: 'dispatch_prompt' }),
    ]);

    expect((await rig.ticket(id)).status).toBe('planned');
    expect(rig.driver.starts).toEqual([]);
    expect(await rig.storage.transaction((tx) => tx.runs.get('run-1'))).toBeNull();
  });
});
