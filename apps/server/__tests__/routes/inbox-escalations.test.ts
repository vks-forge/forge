/**
 * The Inbox with escalations: failures and setups listed beside questions, owner stage only.
 *
 * Why: every wait on the owner is one interaction, so the Inbox must show a failure (a retry cap,
 *   a held lane) and a setup (a signed-out harness) as it shows a question, with the escalation
 *   attached so the owner can act in place; and it must not show a wait the Director is still
 *   looking at, or call that ticket "waiting on you" before the owner has anything to do.
 *
 * Pins: `question:<id>` items for all three kinds with the `escalation` view and its actions, the
 *   item dated by when it reached the owner, and a Director-stage wait staying out of every view.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);

interface Item {
  id: string;
  title: string;
  updated_at: string;
  escalation?: { kind: string; stage: string; actions: string[] };
}
interface Page {
  items: Item[];
}

const ids = async (view: string): Promise<string[]> =>
  ((await get(`/projects/fixture/inbox?view=${view}`)).body as Page).items.map(
    (i) => i.id,
  );

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    await tx.tickets.insert(makeTicket('FX', 1, { status: 'waiting_human' }));
    await tx.interactions.insert({
      id: 'int-1',
      ticket_id: 'FX-1',
      kind: 'question',
      payload: { prompt: 'Which database?' },
      status: 'pending',
      asked_at: '2026-10-16T05:00:00.000Z',
      escalated_at: '2026-10-16T05:00:00.000Z',
      timeout_at: '2026-10-17T00:00:00.000Z',
    });
  });
});

afterEach(async () => {
  await t.close();
});

describe('escalations in the Inbox', () => {
  it('carries the escalation of a question item and covers failures and setups too', async () => {
    await t.storage.transaction(async (tx) => {
      await tx.tickets.insert(makeTicket('FX', 4, { status: 'waiting_human' }));
      await tx.tickets.insert(makeTicket('FX', 5, { status: 'waiting_human' }));
      await tx.interactions.insert({
        id: 'int-f',
        ticket_id: 'FX-4',
        kind: 'failure',
        payload: {
          kind: 'failure',
          cause: 'retry_cap',
          summary: 'crash: failed 2 times',
          attempts: [],
        },
        status: 'pending',
        asked_at: '2026-10-16T06:00:00.000Z',
        escalated_at: '2026-10-16T06:01:00.000Z',
        timeout_at: '9999-12-31T23:59:59.999Z',
      });

      await tx.interactions.insert({
        id: 'int-s',
        ticket_id: 'FX-5',
        kind: 'setup',
        payload: {
          kind: 'setup',
          cause: { type: 'login', harness_id: 'claude-code' },
          summary: 'The harness is signed out.',
          fix_href: '/settings/harnesses/claude-code',
        },
        status: 'pending',
        asked_at: '2026-10-16T06:00:00.000Z',
        escalated_at: '2026-10-16T06:02:00.000Z',
        timeout_at: '9999-12-31T23:59:59.999Z',
      });
    });

    const items = ((await get('/projects/fixture/inbox')).body as Page).items;

    const failure = items.find((i) => i.id === 'question:int-f');
    const setup = items.find((i) => i.id === 'question:int-s');

    expect(failure).toMatchObject({
      title: 'crash: failed 2 times',
      updated_at: '2026-10-16T06:01:00.000Z',
      escalation: { kind: 'failure', stage: 'owner', actions: ['retry', 'cancel'] },
    });

    expect(setup?.escalation).toMatchObject({
      kind: 'setup',
      actions: ['recheck', 'cancel'],
    });

    expect(items.find((i) => i.id === 'question:int-1')?.escalation?.kind).toBe(
      'question',
    );
  });

  it('keeps a wait out of the Inbox while the Director is still looking, and does not call its ticket waiting', async () => {
    await t.storage.transaction(async (tx) => {
      await tx.tickets.insert(makeTicket('FX', 6, { status: 'waiting_human' }));
      await tx.interactions.insert({
        id: 'int-d',
        ticket_id: 'FX-6',
        kind: 'question',
        payload: { prompt: 'Which colour?' },
        status: 'pending',
        asked_at: '2026-10-16T06:00:00.000Z',
        timeout_at: '2026-10-17T00:00:00.000Z',
      });
    });

    const all = await ids('all');

    expect(all).not.toContain('question:int-d');
    expect(all).not.toContain('ticket_waiting:FX-6');
  });
});
