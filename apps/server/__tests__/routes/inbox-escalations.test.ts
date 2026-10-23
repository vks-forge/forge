/**
 * The Inbox with escalations: failures and setups listed beside questions, owner stage only.
 *
 * Why: every wait on the owner is one interaction, so the Inbox must show a failure (a retry cap,
 *   a held lane) and a setup (a signed-out harness) as it shows a question, with the escalation
 *   attached so the owner can act in place; and it must not show a wait the Director is still
 *   looking at, or call that ticket "waiting on you" before the owner has anything to do.
 *
 * Pins: a tool approval listed with the exact call as its title; `question:<id>` items for all three kinds with the `escalation` view and its actions, the
 *   item dated by when it reached the owner, and a Director-stage wait staying out of every view;
 *   finished work (review, needs sign-off) listed once through its sign-off item and as a plain
 *   review row only when it has none; a held ticket listed through its decision.
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

  it('lists a tool approval as a question item titled with the exact call and its three actions', async () => {
    await t.storage.transaction(async (tx) => {
      await tx.tickets.insert(makeTicket('FX', 7, { status: 'waiting_human' }));
      await tx.interactions.insert({
        id: 'int-p',
        ticket_id: 'FX-7',
        run_id: 'run-7',
        kind: 'permission',
        payload: {
          kind: 'permission',
          tool: 'shell',
          action: 'shell',
          what: 'pkg add left-pad',
          approval_key: 'key-p',
          reason_code: 'rule_ask',
          lane: 'standard',
          always: {
            offered: true,
            rule: { action: 'shell', resource: 'pkg add left-pad' },
          },
          summary: 'Waiting for your approval: pkg add left-pad',
        },
        status: 'pending',
        asked_at: '2026-10-16T07:00:00.000Z',
        escalated_at: '2026-10-16T07:00:00.000Z',
        timeout_at: '9999-12-31T23:59:59.999Z',
      });
    });

    const items = ((await get('/projects/fixture/inbox')).body as Page).items;

    expect(items.find((i) => i.id === 'question:int-p')).toMatchObject({
      title: 'Allow `pkg add left-pad`?',
      updated_at: '2026-10-16T07:00:00.000Z',
      escalation: {
        kind: 'permission',
        stage: 'owner',
        actions: ['allow_once', 'allow_always', 'deny'],
      },
    });
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

describe('finished work in the Inbox', () => {
  const signOff = (id: string, ticketId: string, tier: 'B' | 'C') => ({
    id,
    ticket_id: ticketId,
    kind: 'sign_off' as const,
    payload: {
      kind: 'sign_off',
      cause: tier === 'C' ? 'tier_c' : 'tier_b',
      tier,
      summary: 'The checks passed.',
      checks: {
        passed: 3,
        counts: { critical: 0, high: 0, medium: 0, low: 0 },
        overrides: 0,
      },
    },
    status: 'pending' as const,
    asked_at: '2026-10-16T07:00:00.000Z',
    escalated_at: '2026-10-16T07:00:30.000Z',
    timeout_at: '9999-12-31T23:59:59.999Z',
  });

  it('lists a ticket waiting for a name once, through its sign-off item, and not as a review row too', async () => {
    await t.storage.transaction(async (tx) => {
      await tx.tickets.insert(makeTicket('FX', 7, { status: 'review' }));
      await tx.tickets.insert(makeTicket('FX', 8, { status: 'needs_signoff' }));
      await tx.interactions.insert(signOff('int-so7', 'FX-7', 'B'));
      await tx.interactions.insert(signOff('int-so8', 'FX-8', 'C'));
    });

    const items = ((await get('/projects/fixture/inbox')).body as Page).items;
    const all = items.map((i) => i.id);

    expect(all).toContain('question:int-so7');
    expect(all).toContain('question:int-so8');
    expect(all).not.toContain('ticket_review:FX-7');
    expect(all).not.toContain('ticket_signoff:FX-8');
    expect(items.find((i) => i.id === 'question:int-so8')?.escalation).toMatchObject({
      kind: 'sign_off',
      actions: ['sign_off', 'rework', 'cancel'],
    });

    expect(all.filter((id) => id.endsWith('FX-7') || id.endsWith('so7'))).toHaveLength(1);
  });

  it('still lists a ticket in review with no sign-off item as a plain review row', async () => {
    await t.storage.transaction((tx) =>
      tx.tickets.insert(makeTicket('FX', 9, { status: 'review' })),
    );

    expect(await ids('all')).toContain('ticket_review:FX-9');
  });

  it('lists a held ticket through its decision, with the findings on the view', async () => {
    await t.storage.transaction(async (tx) => {
      await tx.tickets.insert(makeTicket('FX', 10, { status: 'waiting_human' }));
      await tx.interactions.insert({
        id: 'int-dec',
        ticket_id: 'FX-10',
        kind: 'decision',
        payload: {
          kind: 'decision',
          cause: 'findings_hold',
          summary: 'Review found blocking findings and holds the merge for you.',
          stage_id: 'reviewer',
          stage_label: 'Review',
          findings: [],
          rework: { count: 2, cap: 2 },
        },
        status: 'pending',
        asked_at: '2026-10-16T08:00:00.000Z',
        escalated_at: '2026-10-16T08:00:30.000Z',
        timeout_at: '9999-12-31T23:59:59.999Z',
      });
    });

    const items = ((await get('/projects/fixture/inbox')).body as Page).items;

    expect(items.find((i) => i.id === 'question:int-dec')).toMatchObject({
      title: expect.stringContaining('holds the merge for you'),
      // The ticket has no card here, so there is nothing to re-plan through.
      escalation: { kind: 'decision', actions: ['merge_anyway', 'rework', 'cancel'] },
    });

    expect(items.map((i) => i.id)).not.toContain('ticket_waiting:FX-10');
  });
});
