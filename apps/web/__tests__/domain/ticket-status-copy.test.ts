/**
 * Pins: a finished ticket never has an open wait (for every terminal status), an open ticket
 * lists exactly the blockers the server sent, a finished ticket leads with one outcome sentence,
 * a run ends as "Worker run N finished / was stopped / failed" (never "success"), and a stage of a
 * finished ticket reads as history with its round.
 *
 * Why: the eval found a done ticket "Waiting on FR-5" and a cancelled one saying "Run ended
 *   (success)" beside "Failed, round 4". A finished thing must never show a present-tense wait or
 *   a stage verdict as if it were live.
 * Depends on: src/domain/ticket-status-copy. Pure.
 */

import { TERMINAL_STATUSES, TicketStatus } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  isTerminalTicket,
  openBlockersOf,
  outcomeLine,
  runEndWords,
  runOrdinal,
  stageHistoryWords,
} from '#/domain/ticket-status-copy.js';

const ticket = (status: TicketStatus, blocked_by: string[] = ['FR-5']) =>
  ({ status, blocked_by }) as never;

describe('openBlockersOf', () => {
  it('derives no wait for any finished status, even when the server sent none and blocked_by is full', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(
        openBlockersOf({ ticket: ticket(status), open_blockers: undefined }),
      ).toEqual([]);

      expect(isTerminalTicket(status)).toBe(true);
    }
  });

  it('takes the server list when it sends one, and the old list for an open ticket of an older server', () => {
    expect(
      openBlockersOf({ ticket: ticket('planned'), open_blockers: ['FR-9'] }),
    ).toEqual(['FR-9']);

    expect(openBlockersOf({ ticket: ticket('planned'), open_blockers: [] })).toEqual([]);
    expect(
      openBlockersOf({ ticket: ticket('planned'), open_blockers: undefined }),
    ).toEqual(['FR-5']);
  });
});

describe('outcomeLine', () => {
  it('says how a finished ticket ended and nothing for an open one', () => {
    const at = '2026-10-21T07:01:00.000Z';

    expect(outcomeLine({ status: 'cancelled', updated_at: at })).toMatch(
      /^Ticket cancelled at .*Nothing from it was merged\.$/,
    );

    expect(outcomeLine({ status: 'done', updated_at: at })).toMatch(/^Merged at /);
    expect(outcomeLine({ status: 'in_progress', updated_at: at })).toBeNull();
  });
});

describe('runEndWords and runOrdinal', () => {
  it('words a run end without ever saying success', () => {
    expect(runEndWords('success', 3)).toBe('Worker run 3 finished');
    expect(runEndWords('cancelled', 3)).toBe('Worker run 3 was stopped');
    expect(runEndWords('interrupted', 1)).toBe('Worker run 1 was stopped');
    expect(runEndWords('error', 2)).toBe('Worker run 2 failed');
    expect(runEndWords('max_turns', undefined)).toBe('Worker run failed');
    expect(runEndWords(null, 1)).toBe('Worker run 1 ended');
  });

  it('numbers a run by when it started, oldest first', () => {
    const runs = [
      { id: 'b', started_at: '2026-10-20T10:00:00.000Z' },
      { id: 'a', started_at: '2026-10-20T09:00:00.000Z' },
    ];

    expect(runOrdinal(runs, 'a')).toBe(1);
    expect(runOrdinal(runs, 'b')).toBe(2);
    expect(runOrdinal(runs, 'zzz')).toBeUndefined();
  });
});

describe('stageHistoryWords', () => {
  it('reads a stage of a finished ticket as what it last was, with its round', () => {
    expect(stageHistoryWords({ status: 'failed', cycle: 3 })).toBe(
      'Last check: did not pass (round 4)',
    );

    expect(stageHistoryWords({ status: 'passed', cycle: 0 })).toBe('Last check: passed');
    expect(stageHistoryWords({ status: 'running', cycle: 0 })).toBe(
      'Did not run before the ticket ended',
    );
  });
});
