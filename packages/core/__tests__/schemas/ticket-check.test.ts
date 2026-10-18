/**
 * Pins the Director check's answer schema.
 *
 * Why: the engine acts on this answer (it can hold a merge or let the Director sign), so a model
 *   that contradicts itself must be refused as invalid output rather than acted on: a pass that
 *   admits an unmet criterion or a critical or high finding is not a pass. Findings need evidence,
 *   like a reviewer's, and the lists are bounded so one answer cannot flood a card.
 *
 * Pins: a clean pass parses; a pass with a `no` criterion, a critical finding or a high finding is
 *   refused; `changes` and `out_of_plan` may carry them; an unclear criterion does not contradict a
 *   pass; evidence and summary are required; at most 30 criteria and 30 findings; confidence is 0 to 1.
 * Depends on: src/schemas/ticket-check, vitest.
 */

import { describe, expect, it } from 'vitest';
import { TicketCheckOutput } from '#/schemas/ticket-check.js';

const ok = {
  verdict: 'pass',
  summary: 'Meets the plan.',
  acceptance: [{ criterion: 'lists tickets', met: 'yes', evidence: 'a.ts:1' }],
  findings: [],
  confidence: 0.8,
};

describe('TicketCheckOutput', () => {
  it('parses a clean pass', () => {
    expect(TicketCheckOutput.safeParse(ok).success).toBe(true);
  });

  it.each([
    [
      'an unmet criterion',
      { acceptance: [{ criterion: 'x', met: 'no', evidence: 'e' }] },
    ],
    [
      'a critical finding',
      { findings: [{ severity: 'critical', issue: 'i', evidence: 'e' }] },
    ],
    ['a high finding', { findings: [{ severity: 'high', issue: 'i', evidence: 'e' }] }],
  ])('refuses a pass with %s', (_name, patch) => {
    expect(TicketCheckOutput.safeParse({ ...ok, ...patch }).success).toBe(false);
    expect(
      TicketCheckOutput.safeParse({ ...ok, ...patch, verdict: 'changes' }).success,
    ).toBe(true);

    expect(
      TicketCheckOutput.safeParse({ ...ok, ...patch, verdict: 'out_of_plan' }).success,
    ).toBe(true);
  });

  it('lets a pass carry an unclear criterion or a medium finding', () => {
    expect(
      TicketCheckOutput.safeParse({
        ...ok,
        acceptance: [{ criterion: 'x', met: 'unclear', evidence: 'cannot tell' }],
        findings: [{ severity: 'medium', issue: 'i', evidence: 'e' }],
      }).success,
    ).toBe(true);
  });

  it('requires evidence and a summary, and bounds the lists and the confidence', () => {
    expect(
      TicketCheckOutput.safeParse({
        ...ok,
        acceptance: [{ criterion: 'x', met: 'yes', evidence: '' }],
      }).success,
    ).toBe(false);

    expect(TicketCheckOutput.safeParse({ ...ok, summary: '' }).success).toBe(false);
    expect(
      TicketCheckOutput.safeParse({
        ...ok,
        acceptance: Array.from({ length: 31 }, () => ok.acceptance[0]),
      }).success,
    ).toBe(false);

    expect(TicketCheckOutput.safeParse({ ...ok, confidence: 1.5 }).success).toBe(false);
  });
});
