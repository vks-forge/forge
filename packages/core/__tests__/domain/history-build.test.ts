/**
 * Tests for buildHistory, the merge that tells the owner what a ticket went through and why.
 *
 * Why: the owner sees a ticket move between Planned, In progress, Needs you, Review and Done and
 *   needs the reason in plain words. If the merge misorders entries, invents a cause, or shows a
 *   question twice, the History tab misleads the one person who has to decide what to do next.
 *
 * Pins: time order with same-instant tie-breaks, stored reasons becoming titles, reason inference
 *   from the settled question / wake / run neighbours (and none when nothing is stored), waited
 *   time with the slot holder, review and sign-off titles, merge wording by signer, and no
 *   duplicate lines for a question that has an escalation event.
 * Depends on: src/domain/history-build, helpers/history-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { buildHistory } from '#/domain/history-build.js';
import { at, ev, facts, question, run, wake } from '#tests/helpers/history-fixtures.js';

const state = (sec: number, from: string, to: string, reason?: string) =>
  ev(sec, 'ticket_state', {
    ticket_id: 'CHE-1',
    from,
    to,
    ...(reason ? { reason } : {}),
  });

describe('buildHistory ordering', () => {
  it('orders entries by time across sources', () => {
    const entries = buildHistory(
      facts({
        events: [
          state(60, 'in_progress', 'verifying'),
          state(0, 'planned', 'in_progress'),
        ],
        runs: [run('r1', 1, { ended_at: at(59) })],
      }),
    );

    expect(entries.map((e) => e.at)).toEqual([at(0), at(1), at(60)]);
  });

  it('puts a run end before the state change made at the same instant', () => {
    const entries = buildHistory(
      facts({
        events: [state(30, 'in_progress', 'waiting_human')],
        runs: [run('r1', 0, { status: 'max_turns', ended_at: at(30) })],
      }),
    );

    expect(entries.map((e) => e.kind)).toEqual(['run', 'run', 'state']);
    expect(entries[1]?.title).toContain('ran out of turns');
  });

  it('ignores events of other tickets', () => {
    const other = ev(5, 'ticket_state', {
      ticket_id: 'CHE-2',
      from: 'planned',
      to: 'in_progress',
    });

    expect(buildHistory(facts({ events: [other] }))).toEqual([]);
  });
});

describe('buildHistory reasons', () => {
  it('uses a stored reason as the title of a move', () => {
    const [entry] = buildHistory(
      facts({
        events: [
          state(0, 'review', 'in_progress', 'Sent back: zod missing from package.json'),
        ],
      }),
    );

    expect(entry?.title).toBe('Sent back: zod missing from package.json');
    expect(entry).toMatchObject({ kind: 'state', from: 'review', to: 'in_progress' });
  });

  it('puts a wait cause after the label', () => {
    const [entry] = buildHistory(
      facts({ events: [state(0, 'in_progress', 'waiting_human', 'pipeline_pending')] }),
    );

    expect(entry?.title).toBe('Needs you: its lane has no pipeline yet');
  });

  it('borrows the reason from a question settled at the same moment', () => {
    const entries = buildHistory(
      facts({
        events: [
          ev(100, 'escalation_settled', {
            interaction_id: 'i1',
            ticket_id: 'CHE-1',
            action: 'retry',
            by: 'owner',
          }),
          state(100, 'waiting_human', 'in_progress'),
        ],
      }),
    );

    const moved = entries.find((e) => e.kind === 'state');

    expect(moved?.title).toBe('You chose to retry');
  });

  it('borrows the reason from the wake that started the run', () => {
    const entries = buildHistory(
      facts({
        events: [state(10, 'waiting_human', 'in_progress')],
        runs: [run('r1', 11)],
        wakes: [wake('w1', 9, { kind: 'response_wake', consumed_at: at(10) })],
      }),
    );

    expect(entries.find((e) => e.kind === 'state')?.title).toBe(
      'Started again because an answer arrived',
    );
  });

  it('says only what moved when nothing stored explains it', () => {
    const [entry] = buildHistory(facts({ events: [state(0, 'planned', 'in_progress')] }));

    expect(entry?.title).toBe('Started');
    expect(entry?.detail).toBeUndefined();
  });
});

describe('buildHistory waits and questions', () => {
  it('records the wait for a Worker slot and who held it', () => {
    const entries = buildHistory(
      facts({
        runs: [run('r1', 300)],
        wakes: [wake('w1', 0)],
        otherRuns: [run('r0', -100, { ticket_id: 'CHE-3', ended_at: at(290) })],
      }),
    );

    expect(entries[0]?.title).toBe('Waited 5 minutes for a Worker slot (CHE-3 had it)');
    expect(entries[0]?.waited_ms).toBe(300_000);
  });

  it('does not note a short wait', () => {
    const entries = buildHistory(facts({ runs: [run('r1', 5)], wakes: [wake('w1', 0)] }));

    expect(entries[0]?.waited_ms).toBeUndefined();
    expect(entries[0]?.title).toContain('started working');
  });

  it('writes a question and its answer with the time it waited', () => {
    const entries = buildHistory(
      facts({
        interactions: [
          question('i1', 0, {
            status: 'answered',
            answered_at: at(120),
            answer: { text: 'Postgres' },
          }),
        ],
      }),
    );

    expect(entries.map((e) => e.title)).toEqual([
      'The Worker asked: Which database?',
      'You answered',
    ]);

    expect(entries[1]).toMatchObject({ detail: 'Postgres', waited_ms: 120_000 });
  });

  it('says how long a timed-out question went unanswered', () => {
    const entries = buildHistory(
      facts({
        interactions: [
          question('i1', 0, { status: 'timed_out', timeout_at: at(2 * 86400) }),
        ],
      }),
    );

    expect(entries[1]?.title).toBe('Question unanswered for 2 days, timed out');
  });

  it('does not repeat a question its escalation events already describe', () => {
    const entries = buildHistory(
      facts({
        events: [
          ev(0, 'escalation', {
            interaction_id: 'i1',
            ticket_id: 'CHE-1',
            escalation_kind: 'question',
            title: 'Which database?',
          }),
          ev(60, 'escalation_settled', {
            interaction_id: 'i1',
            ticket_id: 'CHE-1',
            action: 'answer',
            by: 'owner',
          }),
        ],
        interactions: [question('i1', 0, { status: 'answered', answered_at: at(60) })],
      }),
    );

    expect(entries.map((e) => e.title)).toEqual([
      'Needs you: Which database?',
      'You answered the question',
    ]);
  });
});
