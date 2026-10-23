/**
 * `PATCH /tickets/:id` on the real engine door.
 *
 * Why: the owner needs to raise a priority, fix a brief and order one ticket before another
 *   from the ticket page, and the page keys its inline messages on the error code. The route must
 *   answer the contract codes, carry the loop in a `dependency_cycle`, and never half-apply an edit.
 *
 * Pins: 200 with the ticket after a priority + description + dependency edit; replacement and
 *   clearing of `depends_on`; 409 `dependency_cycle` with the loop; 409 `dependency_cancelled`,
 *   `description_locked`, `dependency_on_started_ticket`, `ticket_closed`; 400 `self_dependency`,
 *   `cross_project_dependency`, `invalid_request`, `invalid_ticket_id`; 404 `ticket_not_found`,
 *   `dependency_not_found`; 401 without the token.
 * Depends on: helpers/flow-rig, helpers/read-rig (makeTicket), vitest. IO: a loopback socket.
 */

import type { Ticket } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFlowRig } from '#tests/helpers/flow-rig.js';
import type { FlowRig } from '#tests/helpers/flow-rig.js';
import { makeTicket } from '#tests/helpers/read-rig.js';

let ctx: FlowRig;

const seed = async (...rows: Ticket[]): Promise<void> => {
  await ctx.storage.transaction(async (tx) => {
    for (const row of rows) {
      await tx.tickets.insert(row);
    }
  });
};

const patch = (id: string, body: unknown) =>
  ctx.rig.json('PATCH', `/tickets/${id}`, body);

const errorOf = (res: { body: unknown }) =>
  (res.body as { error: { code: string; cycle?: string[] } }).error;

const stored = (id: string) =>
  ctx.storage.transaction((tx) => tx.tickets.get(id as Ticket['id']));

beforeEach(async () => {
  ctx = await startFlowRig();
});

afterEach(async () => {
  await ctx.close();
});

describe('PATCH /tickets/:id', () => {
  it('applies priority, description and dependencies and answers the ticket', async () => {
    await seed(makeTicket('FX', 1), makeTicket('FX', 2), makeTicket('FX', 3));

    const res = await patch('FX-1', {
      priority: 3,
      body: 'Sharper brief.',
      depends_on: ['FX-2', 'FX-3'],
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticket: {
        id: 'FX-1',
        priority: 3,
        body: 'Sharper brief.',
        blocked_by: ['FX-2', 'FX-3'],
      },
    });

    const after = await patch('FX-1', { depends_on: ['FX-3'] });
    expect(after.body).toMatchObject({ ticket: { blocked_by: ['FX-3'], priority: 3 } });

    const cleared = await patch('FX-1', { depends_on: [] });
    expect(cleared.body).toMatchObject({ ticket: { blocked_by: [] } });
  });

  it('answers 409 dependency_cycle with the loop and stores nothing', async () => {
    await seed(makeTicket('FX', 1), makeTicket('FX', 2));
    await patch('FX-2', { depends_on: ['FX-1'] });

    const res = await patch('FX-1', { priority: 5, depends_on: ['FX-2'] });

    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'dependency_cycle',
      cycle: ['FX-1', 'FX-2', 'FX-1'],
    });

    expect(await stored('FX-1')).toMatchObject({ priority: 0, blocked_by: [] });
  });

  it('answers 409 for a cancelled target, a started ticket and a closed ticket', async () => {
    await seed(
      makeTicket('FX', 1),
      makeTicket('FX', 2, { status: 'cancelled' }),
      makeTicket('FX', 3, { status: 'in_progress', assignee_run_id: 'r1' }),
      makeTicket('FX', 4, { status: 'done' }),
    );

    const cancelled = await patch('FX-1', { depends_on: ['FX-2'] });
    const locked = await patch('FX-3', { body: 'late' });
    const started = await patch('FX-3', { depends_on: ['FX-1'] });
    const closed = await patch('FX-4', { priority: 1 });

    expect([cancelled, locked, started, closed].map((r) => r.status)).toEqual([
      409, 409, 409, 409,
    ]);

    expect([cancelled, locked, started, closed].map((r) => errorOf(r).code)).toEqual([
      'dependency_cancelled',
      'description_locked',
      'dependency_on_started_ticket',
      'ticket_closed',
    ]);

    expect((await patch('FX-3', { priority: 2 })).status).toBe(200);
  });

  it('answers 400 and 404 for bad input, itself, another project and unknown tickets', async () => {
    await seed(makeTicket('FX', 1), makeTicket('OT', 1));

    const self = await patch('FX-1', { depends_on: ['FX-1'] });
    const cross = await patch('FX-1', { depends_on: ['OT-1'] });
    const empty = await patch('FX-1', {});
    const malformed = await patch('nope', { priority: 1 });
    const missing = await patch('FX-9', { priority: 1 });
    const unknownDep = await patch('FX-1', { depends_on: ['FX-9'] });

    expect([self.status, errorOf(self).code]).toEqual([400, 'self_dependency']);
    expect([cross.status, errorOf(cross).code]).toEqual([
      400,
      'cross_project_dependency',
    ]);

    expect([empty.status, errorOf(empty).code]).toEqual([400, 'invalid_request']);
    expect([malformed.status, errorOf(malformed).code]).toEqual([
      400,
      'invalid_ticket_id',
    ]);

    expect([missing.status, errorOf(missing).code]).toEqual([404, 'ticket_not_found']);
    expect([unknownDep.status, errorOf(unknownDep).code]).toEqual([
      404,
      'dependency_not_found',
    ]);
  });

  it('is refused without the token', async () => {
    await seed(makeTicket('FX', 1));

    const res = await ctx.rig.json(
      'PATCH',
      '/tickets/FX-1',
      { priority: 1 },
      { authorization: '' },
    );

    expect(res.status).toBe(401);
  });
});
