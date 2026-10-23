/**
 * Tests for the plan coverage check.
 *
 * Why: approving a re-plan cancels earlier tickets; the owner and the Director need to know
 *   which of them the new plan silently drops. A missed uncovered ticket loses work; a false
 *   alarm makes the owner distrust the list.
 *
 * Pins: coverage by file overlap, by title, by plan key, by a mention in non-goals or
 *   assumptions, and an uncovered ticket being reported.
 * Depends on: src/domain/plan-coverage, tests/helpers/plan-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { uncoveredTickets } from '#/domain/plan-coverage.js';
import type { CancelledTicketFacts } from '#/types/plan-coverage.types.js';
import { plan, ticket } from '#tests/helpers/plan-fixtures.js';

const old = (
  id: string,
  over: Partial<CancelledTicketFacts> = {},
): CancelledTicketFacts => ({
  id,
  title: `Old ${id}`,
  files: [`old/${id}.ts`],
  acceptance: [],
  ...over,
});

describe('uncoveredTickets', () => {
  it('reports a cancelled ticket nothing in the plan mentions', () => {
    const out = uncoveredTickets([old('CHE-3')], plan({ tickets: [ticket('t1')] }));

    expect(out.map((t) => t.id)).toEqual(['CHE-3']);
  });

  it('covers a ticket whose file the plan touches', () => {
    const p = plan({ tickets: [ticket('t1', { files: ['./old\\CHE-3.ts'] })] });

    expect(uncoveredTickets([old('CHE-3')], p)).toEqual([]);
  });

  it('covers a ticket with the same title or the same plan key', () => {
    const p = plan({ tickets: [ticket('t1', { title: 'old che-6' }), ticket('t7')] });

    expect(uncoveredTickets([old('CHE-6'), old('CHE-9', { planKey: 't7' })], p)).toEqual(
      [],
    );
  });

  it('covers a ticket the plan names as dropped, by id or plan key, as a whole word only', () => {
    const p = plan({
      tickets: [ticket('t1')],
      non_goals: ['CHE-3 is dropped'],
      assumptions: ['t6 stays out'],
    });

    expect(
      uncoveredTickets(
        [old('CHE-3'), old('CHE-8', { planKey: 't6' }), old('CHE-30')],
        p,
      ).map((t) => t.id),
    ).toEqual(['CHE-30']);
  });
});
