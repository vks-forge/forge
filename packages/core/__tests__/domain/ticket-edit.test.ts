/**
 * Tests for the ticket edit rules.
 *
 * Why: the owner and the card's Director both edit tickets, and a wrong edit strands work:
 *   a loop leaves both tickets Queued forever, a cross-project or cancelled dependency is never
 *   satisfied, and changing a running ticket's brief or adding a wait to it breaks work already
 *   in flight. These pins make every refusal reachable and name the code each door maps.
 *
 * Pins: TicketEditBody needs one field and bounds priority; self edge, unknown, cross-project,
 *   cancelled and cycle refusals; a done target is allowed; a kept edge is not re-checked;
 *   running tickets take priority and dependency removal but not description or new waits;
 *   closed tickets take nothing.
 * Depends on: src/domain/ticket-edit, src/schemas/ticket-edit, __tests__/helpers/fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { checkTicketEdit } from '#/domain/ticket-edit.js';
import type { TicketId } from '#/schemas/ids.js';
import { TicketEditBody } from '#/schemas/ticket-edit.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { TicketEditFacts } from '#/types/ticket-edit.types.js';
import { makeTicket } from '#tests/helpers/fixtures.js';

const id = (n: number): TicketId => `SF-${n}` as TicketId;
const t = (n: number, over: Partial<Ticket> = {}): Ticket =>
  makeTicket({ id: id(n), ...over });

function facts(
  over: Partial<Omit<TicketEditFacts, 'targets'>> & { targets?: Ticket[] } = {},
): TicketEditFacts {
  const { targets = [], ...rest } = over;

  return {
    ticket: t(1),
    targets: new Map(targets.map((x) => [x.id as string, x])),
    currentDependsOn: [],
    edges: [],
    ...rest,
  };
}

describe('TicketEditBody', () => {
  it('needs at least one field and rejects unknown keys', () => {
    expect(TicketEditBody.safeParse({}).success).toBe(false);
    expect(TicketEditBody.safeParse({ priority: 1, title: 'x' }).success).toBe(false);
    expect(TicketEditBody.safeParse({ depends_on: [] }).success).toBe(true);
  });

  it('bounds priority to whole numbers in range and rejects bad ids', () => {
    expect(TicketEditBody.safeParse({ priority: 1.5 }).success).toBe(false);
    expect(TicketEditBody.safeParse({ priority: 101 }).success).toBe(false);
    expect(TicketEditBody.safeParse({ depends_on: ['nope'] }).success).toBe(false);
  });
});

describe('checkTicketEdit dependencies', () => {
  it('accepts a dependency on an open ticket of the same project', () => {
    expect(checkTicketEdit({ depends_on: [id(2)] }, facts({ targets: [t(2)] }))).toEqual({
      ok: true,
    });
  });

  it('allows a done target but refuses a cancelled one', () => {
    expect(
      checkTicketEdit(
        { depends_on: [id(2)] },
        facts({ targets: [t(2, { status: 'done' })] }),
      ).ok,
    ).toBe(true);

    const out = checkTicketEdit(
      { depends_on: [id(2)] },
      facts({ targets: [t(2, { status: 'cancelled' })] }),
    );

    expect(out).toMatchObject({ ok: false, code: 'dependency_cancelled', ids: ['SF-2'] });
  });

  it('refuses a self edge, an unknown id and another project', () => {
    expect(checkTicketEdit({ depends_on: [id(1)] }, facts())).toMatchObject({
      code: 'self_dependency',
    });

    expect(checkTicketEdit({ depends_on: [id(9)] }, facts())).toMatchObject({
      code: 'dependency_not_found',
    });

    expect(
      checkTicketEdit(
        { depends_on: [id(2)] },
        facts({ targets: [t(2, { project: 'OTHER' })] }),
      ),
    ).toMatchObject({ code: 'cross_project_dependency' });
  });

  it('refuses an edge that closes a loop and names it', () => {
    const out = checkTicketEdit(
      { depends_on: [id(2)] },
      facts({
        targets: [t(2)],
        edges: [
          { from: id(2), to: id(3) },
          { from: id(3), to: id(1) },
        ],
      }),
    );

    expect(out).toMatchObject({
      ok: false,
      code: 'dependency_cycle',
      ids: ['SF-1', 'SF-2', 'SF-3', 'SF-1'],
    });
  });

  it('does not re-check an edge that stays, even to a cancelled ticket', () => {
    const out = checkTicketEdit(
      { depends_on: [id(2)] },
      facts({
        targets: [t(2, { status: 'cancelled' })],
        currentDependsOn: [id(2)],
      }),
    );

    expect(out.ok).toBe(true);
  });
});

describe('checkTicketEdit by ticket state', () => {
  const running = t(1, { status: 'in_progress', assignee_run_id: 'r1' });

  it('lets a running ticket change priority and drop dependencies', () => {
    expect(checkTicketEdit({ priority: 5 }, facts({ ticket: running })).ok).toBe(true);
    expect(
      checkTicketEdit(
        { depends_on: [] },
        facts({ ticket: running, currentDependsOn: [id(2)] }),
      ).ok,
    ).toBe(true);
  });

  it('refuses a new description or a new dependency on a running ticket', () => {
    expect(checkTicketEdit({ body: 'new' }, facts({ ticket: running }))).toMatchObject({
      code: 'description_locked',
    });

    expect(
      checkTicketEdit(
        { depends_on: [id(2)] },
        facts({ ticket: running, targets: [t(2)] }),
      ),
    ).toMatchObject({ code: 'dependency_on_started_ticket' });
  });

  it('lets a planned ticket change its description', () => {
    expect(
      checkTicketEdit({ body: 'new' }, facts({ ticket: t(1, { status: 'planned' }) })).ok,
    ).toBe(true);
  });

  it.each(['done', 'cancelled'] as const)('refuses any edit of a %s ticket', (status) => {
    expect(
      checkTicketEdit({ priority: 3 }, facts({ ticket: t(1, { status }) })),
    ).toMatchObject({ code: 'ticket_closed' });
  });
});
