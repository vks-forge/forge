/**
 * Pins: the words of a merge-conflict stop (who changed the files first, what each button does, what
 * the pre-filled re-plan note says) are built from the payload, name no language or tool, and say
 * plainly that re-plan is not yet ticket-scoped.
 *
 * Why: the owner never resolves a conflict by hand, so this card is the one place they decide
 *   between one more attempt, a new plan and giving up. Vague words ("a conflict occurred") or a
 *   button that promises more than it does (a ticket-only re-plan that re-plans the card) make them
 *   pick wrong.
 * Depends on: domain/conflict-copy. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  CONFLICT_ACTION_LABEL,
  CONFLICT_RETRY_HINT,
  conflictHelp,
  conflictReplan,
  upstreamLine,
  visibleFiles,
} from '#/domain/conflict-copy.js';

const conflict = {
  files: ['src/cli.ts'],
  upstream: [{ ref: 'abc1234', ticket_id: 'FR-6', title: 'Add the --json flag' }],
};

describe('conflictHelp', () => {
  it('names the other ticket and the file, then says what each button does', () => {
    const help = conflictHelp(conflict);

    expect(help).toContain('FR-6 changed src/cli.ts first');
    expect(help).toContain('Try again gives it one more attempt');
    expect(help).toContain('Re-plan this ticket');
    expect(help).toContain('keeping work that already merged');
    expect(help).toContain('Cancel stops it');
  });

  it('counts files and lists several tickets without naming a language', () => {
    const help = conflictHelp({
      files: ['a', 'b', 'c'],
      upstream: [
        { ref: '1', ticket_id: 'FR-6', title: 'x' },
        { ref: '2', ticket_id: 'FR-7', title: 'y' },
      ],
    });

    expect(help).toContain('FR-6 and FR-7 changed 3 files first');
    expect(help).not.toMatch(/npm|node|lock|package/i);
  });

  it('still reads well with no payload or with commits that name no ticket', () => {
    expect(conflictHelp(undefined)).toContain(
      'Another ticket changed the same files first',
    );

    expect(
      conflictHelp({ files: ['a.txt'], upstream: [{ ref: 'f00', title: 'Tidy' }] }),
    ).toContain('Other work changed a.txt first');
  });
});

describe('the buttons and the pre-filled re-plan note', () => {
  it('relabels retry and re-plan and hints what retry does', () => {
    expect(CONFLICT_ACTION_LABEL).toEqual({
      retry: 'Try again',
      replan: 'Re-plan this ticket',
    });

    expect(CONFLICT_RETRY_HINT).toBe(
      'This gives it one more attempt to combine both changes.',
    );
  });

  it('pre-fills the note with the ticket and is honest that the whole card is re-planned', () => {
    const replan = conflictReplan('FR-8');

    expect(replan.comment).toBe('Re-plan only FR-8; keep merged tickets');
    expect(replan.title).toBe('Re-plan this ticket?');
    expect(replan.description).toMatch(/whole card/i);
    expect(replan.description).toMatch(/already merged stays merged/i);
  });
});

describe('the lists', () => {
  it('shows an upstream change by ticket and title, or by its commit when it names none', () => {
    expect(upstreamLine(conflict.upstream[0]!)).toBe('FR-6: Add the --json flag');
    expect(upstreamLine({ ref: 'f00ba12', title: 'Tidy' })).toBe('Tidy (f00ba12)');
  });

  it('shows the first five files and counts the rest', () => {
    const files = ['1', '2', '3', '4', '5', '6', '7'];

    expect(visibleFiles(files)).toEqual({
      shown: ['1', '2', '3', '4', '5'],
      hidden: ['6', '7'],
    });

    expect(visibleFiles(['1'])).toEqual({ shown: ['1'], hidden: [] });
  });
});
