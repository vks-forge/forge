/**
 * Contract cases for ticket relations and the ticket fields derived from them.
 *
 * Why: a ticket's parent and its blockers decide whether the Director may start it. If
 * `Ticket.parent` / `blocked_by` were stored beside `ticket_relations`, the two could
 * disagree and a ticket would start while a blocker is still open. These cases pin that
 * `ticket_relations` is the only source: the ticket fields are derived on read on every
 * backend, a patch cannot write them, and the nullable engine fields (branch, worktree,
 * assignee run, ...) round-trip and clear like the other optional columns
 * (director-core.md §3).
 *
 * Exports: describeTicketRelationsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { InvalidInputError, toTicketPatch, transition } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { T0, makeTicket } from '#tests/helpers/fixtures.js';

const A = makeTicket(1).id;
const B = makeTicket(2).id;
const C = makeTicket(3).id;

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeTicketRelationsContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('ticket relations', () => {
    it('adds an edge once: true for a new edge, false for the same edge again', async () => {
      const first = await tx((t) =>
        t.ticketRelations.add({ from_id: A, to_id: B, kind: 'depends_on' }),
      );

      const again = await tx((t) =>
        t.ticketRelations.add({ from_id: A, to_id: B, kind: 'depends_on' }),
      );

      const other = await tx((t) =>
        t.ticketRelations.add({ from_id: A, to_id: B, kind: 'related' }),
      );

      expect([first, again, other]).toEqual([true, false, true]);
    });

    it('lists edges at either end in insertion order, with created_at', async () => {
      await tx(async (t) => {
        await t.ticketRelations.add({
          from_id: A,
          to_id: B,
          kind: 'blocks',
          created_at: T0,
        });

        await t.ticketRelations.add({ from_id: C, to_id: A, kind: 'related' });
        await t.ticketRelations.add({ from_id: B, to_id: C, kind: 'related' });
      });

      const forA = await tx((t) => t.ticketRelations.listFor(A));
      expect(forA).toEqual([
        { from_id: A, to_id: B, kind: 'blocks', created_at: T0 },
        { from_id: C, to_id: A, kind: 'related' },
      ]);
    });

    it('removes an edge: true once, false when it is not there', async () => {
      await tx((t) => t.ticketRelations.add({ from_id: A, to_id: B, kind: 'blocks' }));
      const gone = await tx((t) => t.ticketRelations.remove(A, B, 'blocks'));
      const again = await tx((t) => t.ticketRelations.remove(A, B, 'blocks'));
      const wrongKind = await tx((t) => t.ticketRelations.remove(A, B, 'related'));
      expect([gone, again, wrongKind]).toEqual([true, false, false]);
      expect(await tx((t) => t.ticketRelations.listFor(A))).toEqual([]);
    });

    it('rejects a self edge and a malformed id with InvalidInputError', async () => {
      const self = await tx((t) =>
        t.ticketRelations.add({ from_id: A, to_id: A, kind: 'related' }),
      ).catch((e: unknown) => e);

      const bad = await tx((t) =>
        t.ticketRelations.add({ from_id: 'nope' as never, to_id: A, kind: 'related' }),
      ).catch((e: unknown) => e);

      expect(self).toBeInstanceOf(InvalidInputError);
      expect(bad).toBeInstanceOf(InvalidInputError);
    });

    it('rolls back with the transaction', async () => {
      await expect(
        tx(async (t) => {
          await t.ticketRelations.add({ from_id: A, to_id: B, kind: 'blocks' });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.ticketRelations.listFor(A))).toEqual([]);
    });
  });

  describe('Ticket.parent and Ticket.blocked_by are derived from ticket_relations', () => {
    const seed = () =>
      tx(async (t) => {
        await t.tickets.insert(makeTicket(1));
        await t.tickets.insert(makeTicket(2));
        await t.tickets.insert(makeTicket(3));
      });

    it('parent is the target of a spawned_from edge out of the ticket, and clears when it is removed', async () => {
      await seed();
      await tx((t) =>
        t.ticketRelations.add({ from_id: A, to_id: B, kind: 'spawned_from' }),
      );

      const withParent = await tx((t) => t.tickets.get(A));
      await tx((t) => t.ticketRelations.remove(A, B, 'spawned_from'));
      const without = await tx((t) => t.tickets.get(A));
      expect(withParent?.parent).toBe(B);
      expect('parent' in (without ?? {})).toBe(false);
    });

    it('the first spawned_from edge wins when there are several', async () => {
      await seed();
      await tx(async (t) => {
        await t.ticketRelations.add({ from_id: A, to_id: C, kind: 'spawned_from' });
        await t.ticketRelations.add({ from_id: A, to_id: B, kind: 'spawned_from' });
      });

      expect((await tx((t) => t.tickets.get(A)))?.parent).toBe(C);
    });

    it('blocked_by gathers depends_on edges out and blocks edges in, once each, in edge order', async () => {
      await seed();
      await tx(async (t) => {
        await t.ticketRelations.add({ from_id: A, to_id: B, kind: 'depends_on' });
        await t.ticketRelations.add({ from_id: C, to_id: A, kind: 'blocks' });
        await t.ticketRelations.add({ from_id: B, to_id: A, kind: 'blocks' });
        await t.ticketRelations.add({ from_id: A, to_id: C, kind: 'related' });
      });

      const [viaGet] = await tx((t) => t.tickets.listByStatus('inbox')).then((l) =>
        l.filter((x) => x.id === A),
      );

      expect(viaGet?.blocked_by).toEqual([B, C]);
      expect((await tx((t) => t.tickets.get(A)))?.blocked_by).toEqual([B, C]);
      expect((await tx((t) => t.tickets.get(B)))?.blocked_by).toEqual([]);
    });

    it('insert records parent and blocked_by as relation rows, so a seeded ticket reads back as written', async () => {
      await tx(async (t) => {
        await t.tickets.insert(makeTicket(2));
        await t.tickets.insert(makeTicket(3));
        await t.tickets.insert(makeTicket(1, { parent: B, blocked_by: [C] }));
      });

      const got = await tx((t) => t.tickets.get(A));
      const edges = await tx((t) => t.ticketRelations.listFor(A));
      expect(got).toMatchObject({ parent: B, blocked_by: [C] });
      expect(edges.map((e) => [e.from_id, e.to_id, e.kind])).toEqual([
        [A, B, 'spawned_from'],
        [A, C, 'depends_on'],
      ]);
    });

    it('a patch carrying parent or blocked_by is refused and changes nothing', async () => {
      await seed();
      for (const patch of [{ parent: B }, { blocked_by: [B] }, { parent: undefined }]) {
        const failure = await tx((t) =>
          t.tickets.updateTicketCas(A, 0, patch as never),
        ).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(InvalidInputError);
      }

      expect(await tx((t) => t.ticketRelations.listFor(A))).toEqual([]);
      expect((await tx((t) => t.tickets.get(A)))?.status_version).toBe(0);
    });

    it('toTicketPatch of a derived ticket leaves the relations untouched', async () => {
      await tx(async (t) => {
        await t.tickets.insert(makeTicket(2));
        await t.tickets.insert(makeTicket(1, { status: 'in_progress', parent: B }));
      });

      const cur = await tx((t) => t.tickets.get(A));
      const r = transition(cur as NonNullable<typeof cur>, { type: 'verifying', at: T0 });
      if (!r.ok) {
        throw new Error('unexpected transition error');
      }

      const ok = await tx((t) => t.tickets.updateTicketCas(A, 0, toTicketPatch(r.value)));
      expect(ok).toBe(true);
      expect(await tx((t) => t.tickets.get(A))).toMatchObject({
        status: 'verifying',
        parent: B,
      });
    });
  });

  describe('ticket engine fields', () => {
    const full = {
      assignee_run_id: 'run-1',
      branch: 'feat/SF-1-x',
      worktree: '.forge/data/worktrees/SF-1',
      checkout_run_id: 'run-1',
      epic_id: B,
      created_by_intake: 4,
      pr_number: 7,
      pr_url: 'https://github.com/o/r/pull/7',
    };

    it('round-trips through insert and get', async () => {
      await tx((t) => t.tickets.insert(makeTicket(1, full)));
      expect(await tx((t) => t.tickets.get(A))).toEqual(makeTicket(1, full));
    });

    it('are set by a CAS patch and cleared by an explicit undefined', async () => {
      await tx((t) => t.tickets.insert(makeTicket(1)));
      await tx((t) => t.tickets.updateTicketCas(A, 0, full));
      expect(await tx((t) => t.tickets.get(A))).toMatchObject(full);
      await tx((t) =>
        t.tickets.updateTicketCas(A, 1, {
          assignee_run_id: undefined,
          branch: undefined,
          worktree: undefined,
          checkout_run_id: undefined,
          epic_id: undefined,
          created_by_intake: undefined,
          pr_number: undefined,
          pr_url: undefined,
        }),
      );

      const got = await tx((t) => t.tickets.get(A));
      for (const k of Object.keys(full)) {
        expect(k in (got ?? {})).toBe(false);
      }
    });

    it('a transition() patch clears an engine field the next ticket lacks', async () => {
      await tx((t) =>
        t.tickets.insert(makeTicket(1, { status: 'in_progress', ...full })),
      );

      const cur = await tx((t) => t.tickets.get(A));
      const next = { ...(cur as NonNullable<typeof cur>) };
      delete next.assignee_run_id;
      await tx((t) => t.tickets.updateTicketCas(A, 0, toTicketPatch(next)));
      const got = await tx((t) => t.tickets.get(A));
      expect('assignee_run_id' in (got ?? {})).toBe(false);
      expect(got?.branch).toBe(full.branch);
    });
  });
}
