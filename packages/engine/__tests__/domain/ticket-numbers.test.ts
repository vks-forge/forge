/**
 * Tests for ticket number allocation.
 *
 * Why: ticket ids are the database primary key and appear in branches and receipts
 *   (d-0055), so a duplicate or a reused number would merge two tickets' histories. The
 *   next number is derived from existing ids inside the intake transaction; the derivation
 *   must ignore other projects' ids and malformed strings.
 *
 * Pins: next = max + 1 for the prefix, 1 when none; other prefixes and junk are ignored;
 *   gaps are not reused.
 * Depends on: src/domain/ticket-numbers, vitest.
 */

import { describe, expect, it } from 'vitest';
import { nextTicketNumber } from '#/domain/ticket-numbers.js';

describe('nextTicketNumber', () => {
  it('starts at 1', () => {
    expect(nextTicketNumber([], 'FG')).toBe(1);
  });

  it('is max + 1 for the prefix and does not reuse gaps', () => {
    expect(nextTicketNumber(['FG-1', 'FG-7', 'FG-3'], 'FG')).toBe(8);
  });

  it('ignores other projects, prefixes that merely start the same, and junk', () => {
    expect(nextTicketNumber(['SF-40', 'FGX-9', 'FG-x', 'nope', 'FG-2'], 'FG')).toBe(3);
  });

  it('counts each project on its own when two projects share one id list', () => {
    const ids = ['FG-1', 'FG-2', 'FG-3', 'AP-1'];
    expect(nextTicketNumber(ids, 'FG')).toBe(4);
    expect(nextTicketNumber(ids, 'AP')).toBe(2);
    expect(nextTicketNumber(ids, 'ZZ')).toBe(1);
  });
});
