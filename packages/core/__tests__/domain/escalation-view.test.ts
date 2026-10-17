/**
 * Tests for `toEscalation`, the one reader of interaction rows.
 *
 * Why: rows from before escalations existed carry free-form payloads, new rows carry a typed
 *   one, and the owner's screens must show both the same way without ever failing on an odd
 *   row. A reader that threw on a bad payload would blank the Inbox; one that guessed the stage
 *   wrong would show the owner a question the Director is still looking at, or hide one the
 *   owner must answer.
 *
 * Pins: a typed payload is used as is; legacy question, plan_confirm, permission and blocked
 *   rows become `question` with source legacy and no options; an unparseable payload becomes a
 *   clipped question; stage follows `escalated_at`; settled comes from a typed answer, a raw
 *   answer counts as the owner's, and a timed-out row reads as settled by timeout.
 * Depends on: src/domain/escalation-view, vitest.
 */

import { describe, expect, it } from 'vitest';
import { toEscalation } from '#/domain/escalation-view.js';
import type { CardId } from '#/schemas/ids.js';
import type { Interaction } from '#/schemas/interaction.js';

const AT = '2026-10-17T00:00:00.000Z';
const LATER = '2026-10-17T00:05:00.000Z';

const row = (over: Partial<Interaction> = {}): Interaction => ({
  id: 'int-1',
  ticket_id: 'FG-1',
  kind: 'question',
  payload: { prompt: 'Which colour?' },
  status: 'pending',
  asked_at: AT,
  timeout_at: '2026-10-17T04:00:00.000Z',
  ...over,
});

const textOf = (view: ReturnType<typeof toEscalation>): string =>
  view.payload.kind === 'question' ? view.payload.text : '';

describe('toEscalation', () => {
  it('uses a typed payload as it is', () => {
    const payload = {
      kind: 'failure',
      cause: 'retry_cap',
      summary: 'crash: failed 2 times',
      attempts: [],
    };

    const view = toEscalation(row({ kind: 'failure', payload, escalated_at: AT }));

    expect(view.kind).toBe('failure');
    expect(view.payload).toEqual(payload);
    expect(view.stage).toBe('owner');
  });

  it.each(['question', 'plan_confirm', 'permission', 'blocked'] as const)(
    'maps a legacy %s row to a question with source legacy',
    (kind) => {
      const view = toEscalation(row({ kind, escalated_at: AT }));

      expect(view.payload).toEqual({
        kind: 'question',
        text: 'Which colour?',
        source: 'legacy',
        options: [],
      });
    },
  );

  it('reads the text from question, reason or a bare string payload', () => {
    expect(textOf(toEscalation(row({ payload: { question: 'Q?' } })))).toBe('Q?');
    expect(
      textOf(toEscalation(row({ kind: 'blocked', payload: { reason: 'stuck' } }))),
    ).toBe('stuck');

    expect(textOf(toEscalation(row({ payload: 'plain text' })))).toBe('plain text');
  });

  it('never throws: an unparseable payload becomes a clipped question', () => {
    const view = toEscalation(
      row({ kind: 'failure', payload: { cause: 'nonsense', long: 'x'.repeat(2000) } }),
    );

    expect(view.kind).toBe('question');
    expect(textOf(view).length).toBeGreaterThan(0);
    expect(textOf(view).length).toBeLessThanOrEqual(300);
  });

  it('is in the Director stage until escalated_at is set', () => {
    expect(toEscalation(row()).stage).toBe('director');
    expect(toEscalation(row({ escalated_at: LATER })).stage).toBe('owner');
    expect(toEscalation(row({ escalated_at: LATER })).escalated_at).toBe(LATER);
  });

  it('carries card_id, run_id and asked_at', () => {
    const view = toEscalation(row({ card_id: 'FG-C1' as CardId, run_id: 'run-1' }));

    expect(view).toMatchObject({
      id: 'int-1',
      ticket_id: 'FG-1',
      card_id: 'FG-C1',
      status: 'pending',
      asked_at: AT,
    });
  });

  it('reads settled from a typed answer', () => {
    const view = toEscalation(
      row({
        status: 'answered',
        answered_at: LATER,
        answer: { action: 'retry', by: 'owner' },
      }),
    );

    expect(view.settled).toEqual({ action: 'retry', by: 'owner', at: LATER });
  });

  it('counts a raw answer as the owner answering', () => {
    const view = toEscalation(
      row({ status: 'answered', answered_at: LATER, answer: 'blue' }),
    );

    expect(view.settled).toEqual({ action: 'answer', by: 'owner', at: LATER });
  });

  it('reads a timed-out or cancelled row as settled by the system, and a pending one as not settled', () => {
    expect(toEscalation(row({ status: 'timed_out' })).settled).toEqual({
      action: 'cancel',
      by: 'auto',
      at: '2026-10-17T04:00:00.000Z',
    });

    expect(toEscalation(row({ status: 'cancelled' })).settled?.by).toBe('auto');
    expect(toEscalation(row()).settled).toBeUndefined();
  });
});
