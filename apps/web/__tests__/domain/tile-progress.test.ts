/**
 * Pins: the words a Board tile uses for elapsed time, stage, run and the card roll-up.
 *
 * Why: the owner reads these lines to judge progress at a glance. "10m 03s" must keep its zero
 *   padding so the clock does not jitter, and the roll-up must say "waiting for you" and
 *   "cancelled" only when there are some and stay silent on a server that sends no counts, so a
 *   tile never states a number the server did not give.
 * Depends on: domain/tile-progress.
 */

import { describe, expect, it } from 'vitest';
import { cardRollup, formatElapsed, runText, stageText } from '#/domain/tile-progress.js';

describe('formatElapsed', () => {
  it.each([
    [0, '0s'],
    [45_000, '45s'],
    [603_000, '10m 03s'],
    [3_720_000, '1h 02m'],
    [-5, '0s'],
  ])('reads %i ms as %s', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe('stage and run text', () => {
  it('names the stage position and label', () => {
    expect(stageText({ index: 4, count: 7, label: 'Review and critique' })).toBe(
      'Stage 4/7 · Review and critique',
    );
  });

  it('names the run and its agent, or the run alone', () => {
    const started_at = '2026-10-23T10:00:00.000Z';

    expect(runText({ number: 2, agent: 'implementer', started_at })).toBe(
      'run 2 · implementer',
    );

    expect(runText({ number: 1, started_at })).toBe('run 1');
  });
});

describe('cardRollup', () => {
  it('lists done, running, waiting for you and cancelled, skipping zeros', () => {
    expect(
      cardRollup({
        ticket_count: 11,
        tickets_done: 4,
        tickets_running: 2,
        tickets_waiting_you: 1,
        tickets_cancelled: 3,
      }),
    ).toBe('4 of 11 done · 2 running · 1 waiting for you · 3 cancelled');

    expect(
      cardRollup({
        ticket_count: 3,
        tickets_done: 3,
        tickets_running: 0,
        tickets_waiting_you: 0,
      }),
    ).toBe('3 of 3 done');
  });

  it('says nothing without tickets or without the server counts', () => {
    expect(
      cardRollup({ ticket_count: 0, tickets_done: 0, tickets_running: 0 }),
    ).toBeNull();

    expect(cardRollup({ ticket_count: 5, tickets_done: 1 })).toBeNull();
  });
});
