/**
 * `POST /intake` under the card-first flow, and the reply queue across a restart.
 *
 * Why: chat intake is kept for API compatibility but must now behave like the create-card
 *   form: a card in `grilling`, no ticket, a Director reply queued (d-0128, d-0141). Only the
 *   PR fast path files a ticket. And the reply the Director owes must survive a server
 *   restart: if a created card's reply lived only in memory, the owner would wait on a
 *   Director that never knew it was asked (d-0134). The restart is real here: a file
 *   database is closed and opened again.
 *
 * Pins: a chat new_request answers `card_created` with no ticket and a `grilling` card; the
 *   `pr_issue` type keeps its ticket and starts `queued`; a redelivered event is a duplicate;
 *   a card made through the create route is still queued after the database is reopened, and
 *   a claim after the reopen returns it.
 * Depends on: helpers/flow-rig, helpers/temp, @forge/db, @forge/engine, vitest. IO: a loopback
 *   socket, a temporary SQLite file.
 */

import { join } from 'node:path';
import type { CardId } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { createEngine } from '@forge/engine';
import type { EngineDeps } from '@forge/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFlowRig } from '#tests/helpers/flow-rig.js';
import type { FlowRig } from '#tests/helpers/flow-rig.js';
import { makeTempDir } from '#tests/helpers/temp.js';

let ctx: FlowRig;

beforeEach(async () => {
  ctx = await startFlowRig();
});

afterEach(async () => {
  await ctx.close();
});

const event = (key: string, payload: Record<string, unknown>) => ({
  source: 'chat',
  kind: 'new_request',
  dedupe_key: key,
  actor: { type: 'user', id: 'u1' },
  project: 'fixture',
  payload,
  received_at: '2026-10-16T12:00:00.000Z',
});

describe('POST /intake', () => {
  it('makes a grilling card with no ticket and a queued Director reply for a chat request', async () => {
    const res = await ctx.rig.json(
      'POST',
      '/intake',
      event('m1', { text: 'i want a todo app' }),
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'card_created', cardId: 'FX-C1' });

    const id = 'FX-C1' as CardId;
    const tickets = await ctx.storage.transaction((tx) => tx.tickets.listByCard(id));
    const queue = await ctx.storage.transaction((tx) => tx.cardReplyQueue.listOpen(id));
    const card = await ctx.rig.json('GET', '/cards/FX-C1');

    expect(tickets).toEqual([]);
    expect(queue).toMatchObject([{ reason: 'card_created' }]);
    expect(card.body).toMatchObject({
      phase: 'grilling',
      column: 'shaping',
      ticket_count: 0,
      needs_you: false,
    });
  });

  it('keeps the ticket only on the PR fast path, with the card queued', async () => {
    const res = await ctx.rig.json(
      'POST',
      '/intake',
      event('m2', { text: 'fix the build', card_type: 'pr_issue' }),
    );

    expect(res.body).toEqual({
      status: 'ticket_created',
      ticketId: 'FX-1',
      cardId: 'FX-C1',
    });

    expect((await ctx.rig.json('GET', '/cards/FX-C1')).body).toMatchObject({
      phase: 'queued',
      column: 'queued',
      ticket_count: 1,
    });
  });

  it('reports a redelivered event as a duplicate and makes no second card', async () => {
    await ctx.rig.json('POST', '/intake', event('m3', { text: 'one' }));
    const again = await ctx.rig.json('POST', '/intake', event('m3', { text: 'one' }));

    expect(again.body).toEqual({ status: 'duplicate' });
    expect(
      await ctx.storage.transaction((tx) =>
        tx.cards.listByProject('fixture', { limit: 10 }),
      ),
    ).toHaveLength(1);
  });
});

describe('the reply queue across a restart', () => {
  it('still holds the reply of a created card after the database is closed and reopened', async () => {
    const path = join(makeTempDir('forge-queue-'), 'forge.db');
    const first = createSqliteStorage(path);
    await first.transaction((tx) =>
      tx.projects.upsert({
        id: 'fixture',
        slug: 'fixture',
        prefix: 'FX',
        status: 'ready',
        ecosystems: [],
        harness_defaults: {},
        tier_c_globs: [],
      }),
    );

    const engine = createEngine({
      storage: first,
      clock: { now: () => Date.parse('2026-10-16T12:00:00.000Z') },
    } as unknown as EngineDeps);

    const made = await engine.createCard({
      project: 'fixture',
      title: 'A todo application',
      description: 'Build a small todo application with a list and a form.',
      type: 'plan',
      priority: 'normal',
      depends_on: [],
      blocks: [],
      links: [],
      dedupe_key: 'k',
      actor: { type: 'user', id: 'owner' },
    });

    await first.close();
    const second = createSqliteStorage(path);
    const id = 'FX-C1' as CardId;
    const open = await second.transaction((tx) => tx.cardReplyQueue.listOpen(id));
    const claimed = await second.transaction((tx) =>
      tx.cardReplyQueue.claim('2026-10-16T12:00:05.000Z', '2026-10-16T11:50:00.000Z'),
    );

    await second.close();

    expect(made.status).toBe('created');
    expect(open).toMatchObject([
      { card_id: 'FX-C1', event_id: 0, reason: 'card_created' },
    ]);

    expect(claimed.map((r) => r.card_id)).toEqual(['FX-C1']);
  });
});
