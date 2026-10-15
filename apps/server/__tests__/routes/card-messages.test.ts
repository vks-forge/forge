/**
 * `POST /cards/:id/messages` and the `director` status on `GET /cards/:id`.
 *
 * Why: the Card page chat is built against this contract: the message is accepted at once
 *   (202 with the stored event) and the Director answers later, so every refusal must say why
 *   nothing was stored and the page must be able to show a typing or error state. A closed
 *   card must refuse (a message there would never be answered) and a draining server must
 *   refuse (its queued reply would be lost).
 *
 * Pins: 202 with the event and the engine called with text and author; 400 for a bad id,
 *   empty, oversize, extra-key or missing-field body; 404 `card_not_found`; 409 `card_closed`;
 *   503 `server_draining` with the engine untouched; `director` on card detail in each state.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardEvent } from '@forge/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at, card, startCardRig } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig | undefined;

afterEach(async () => {
  await ctx?.rig.close();
  ctx = undefined;
});

const stored: CardEvent = {
  card_id: 'FX-C1' as CardEvent['card_id'],
  seq: 3,
  kind: 'user_message',
  at: at(30),
  actor: { type: 'user', id: 'vikash' },
  payload: { text: 'hello' },
};

async function start(
  postCardMessage: ReturnType<typeof vi.fn>,
  extra: Record<string, unknown> = {},
): Promise<CardRig> {
  ctx = await startCardRig({ postCardMessage, ...extra });
  await ctx.seed([card(1)]);

  return ctx;
}

describe('POST /cards/:id/messages', () => {
  it('answers 202 with the stored event and hands text and author to the engine', async () => {
    const post = vi.fn(async () => ({ status: 'stored', event: stored }));
    const { rig } = await start(post);

    const res = await rig.json('POST', '/cards/FX-C1/messages', {
      text: 'hello',
      author: 'vikash',
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ event: stored });
    expect(post).toHaveBeenCalledWith('FX-C1', 'hello', 'vikash');
  });

  it('answers 404 card_not_found for an unknown card', async () => {
    const { rig } = await start(vi.fn(async () => ({ status: 'not_found' })));

    const res = await rig.json('POST', '/cards/FX-C9/messages', {
      text: 'x',
      author: 'a',
    });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'card_not_found' } });
  });

  it('answers 409 card_closed for a closed card', async () => {
    const { rig } = await start(vi.fn(async () => ({ status: 'closed' })));

    const res = await rig.json('POST', '/cards/FX-C1/messages', {
      text: 'x',
      author: 'a',
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'card_closed' } });
  });

  it('answers 400 for a malformed card id and for bad bodies, without calling the engine', async () => {
    const post = vi.fn();
    const { rig } = await start(post);
    const bodies = [
      { text: '', author: 'a' },
      { text: 'x'.repeat(8001), author: 'a' },
      { text: 'x', author: '' },
      { text: 'x', author: 'a', extra: 1 },
      { text: 'x' },
      {},
    ];

    for (const body of bodies) {
      expect((await rig.json('POST', '/cards/FX-C1/messages', body)).status).toBe(400);
    }

    const badId = await rig.json('POST', '/cards/nonsense/messages', {
      text: 'x',
      author: 'a',
    });

    expect(badId.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it('answers 503 server_draining without touching the engine', async () => {
    const post = vi.fn();
    ctx = await startCardRig({ postCardMessage: post }, { isDraining: () => true });
    await ctx.seed([card(1)]);

    const res = await ctx.rig.json('POST', '/cards/FX-C1/messages', {
      text: 'x',
      author: 'a',
    });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'server_draining' } });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('director status on GET /cards/:id', () => {
  it.each([
    [{ state: 'idle' }],
    [{ state: 'thinking' }],
    [{ state: 'error', last_error: 'invalid_output: empty reply' }],
  ])('carries %j', async (status) => {
    const { rig } = await start(vi.fn(), { cardDirector: vi.fn(() => status) });

    const res = await rig.json('GET', '/cards/FX-C1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'FX-C1', director: status });
  });
});
