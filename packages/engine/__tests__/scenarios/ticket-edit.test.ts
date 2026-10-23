/**
 * Scenario: editing a ticket's priority, description and dependencies through the engine door.
 *
 * Why: nothing let the owner order restored work before the tickets that need it, and a bad edit
 *   (a loop, another project's ticket, a changed brief for a running Worker) strands work. The
 *   one door `editTicket` must apply all fields in one transaction, replace `depends_on` as a
 *   complete set, leave a plain-words note on the card, and refuse without writing anything.
 *
 * Pins: priority + description write and note; dependency replacement (add, drop, keep) with
 *   notes; a loop refused with nothing written; a missing ticket; a running ticket takes
 *   priority but refuses description and new waits, and may drop a wait.
 * Depends on: helpers/rig, helpers/card-chat, @forge/core types, vitest.
 */

import type { CardActor, TicketId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { history } from '#tests/helpers/card-chat.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const owner: CardActor = { type: 'user', id: 'owner' };
const id = (n: number) => `FG-${n}` as TicketId;
const edit = (rig: Rig, n: number, body: Parameters<Rig['engine']['editTicket']>[1]) =>
  rig.engine.editTicket(id(n), body, owner);

const waits = (rig: Rig, n: number) =>
  rig.storage.transaction(async (tx) =>
    (await tx.ticketRelations.listFor(id(n)))
      .filter((r) => r.kind === 'depends_on' && r.from_id === id(n))
      .map((r) => r.to_id),
  );

const lastNote = async (rig: Rig, card = 'FG-C1') => {
  const notes = (await history(rig, card as never)).filter((e) => e.kind === 'note');

  return notes.at(-1)?.payload;
};

describe('editTicket', () => {
  it('sets priority and description in one write and notes both on the card', async () => {
    const rig = await makeRig();
    await rig.request('one');

    const out = await edit(rig, 1, { priority: 3, body: 'New brief.' });

    expect(out.status).toBe('updated');
    expect(await rig.ticket('FG-1')).toMatchObject({ priority: 3, body: 'New brief.' });
    expect(await lastNote(rig)).toEqual({
      text: 'Owner changed the priority of FG-1 from 0 to 3. Owner changed the description of FG-1.',
    });
  });

  it('replaces the dependency set: adds, drops and keeps edges', async () => {
    const rig = await makeRig();
    await rig.request('one');
    await rig.request('two');
    await rig.request('three');

    await edit(rig, 1, { depends_on: [id(2), id(3)] });
    expect(await waits(rig, 1)).toEqual([id(2), id(3)]);
    expect(await lastNote(rig)).toEqual({ text: 'Owner made FG-1 wait for FG-2, FG-3.' });

    await edit(rig, 1, { depends_on: [id(3)] });
    expect(await waits(rig, 1)).toEqual([id(3)]);
    expect(await lastNote(rig)).toEqual({ text: 'Owner stopped FG-1 waiting for FG-2.' });
    expect((await rig.ticket('FG-1')).blocked_by).toEqual([id(3)]);

    await edit(rig, 1, { depends_on: [] });
    expect(await waits(rig, 1)).toEqual([]);
  });

  it('refuses a loop, naming it, and writes nothing', async () => {
    const rig = await makeRig();
    await rig.request('one');
    await rig.request('two');
    await edit(rig, 2, { depends_on: [id(1)] });

    const out = await edit(rig, 1, { priority: 9, depends_on: [id(2)] });

    expect(out).toMatchObject({
      status: 'refused',
      code: 'dependency_cycle',
      ids: ['FG-1', 'FG-2', 'FG-1'],
    });

    expect(await waits(rig, 1)).toEqual([]);
    expect((await rig.ticket('FG-1')).priority).toBe(0);
  });

  it('reports a ticket that does not exist', async () => {
    const rig = await makeRig();

    expect(await edit(rig, 9, { priority: 1 })).toEqual({ status: 'ticket_not_found' });
  });

  it('lets a started ticket change priority and drop a wait but not its brief or new waits', async () => {
    const rig = await makeRig();
    await rig.request('one');
    await rig.request('two');
    await edit(rig, 1, { depends_on: [id(2)] });
    await rig.engine.editTicket(id(2), { priority: 1 }, owner);
    await rig.tick();

    // FG-2 runs (FG-1 waits for it); FG-2 can no longer be told to wait or have its brief changed.
    const started = await rig.ticket('FG-2');
    expect(started.status).not.toBe('inbox');

    expect(await edit(rig, 2, { body: 'late change' })).toMatchObject({
      status: 'refused',
      code: 'description_locked',
    });

    expect(await edit(rig, 2, { depends_on: [id(1)] })).toMatchObject({
      status: 'refused',
      code: 'dependency_on_started_ticket',
    });

    expect((await edit(rig, 2, { priority: 5 })).status).toBe('updated');
    expect((await edit(rig, 1, { depends_on: [] })).status).toBe('updated');
  });
});
