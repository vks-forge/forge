/**
 * Pins: the cards adapter sends the create request exactly as the contract says (`POST
 * /projects/:slug/cards`, strict body), reads the 201 and the repeated-key 200 the same way,
 * keeps the server's whole refusal body on the error (the dependency cycle lives there), fills
 * the card-flow fields with defaults for an older server, and sets relations with `PUT`.
 *
 * Why: this adapter is the only place that knows the paths and the shapes. A body field that
 *   drifts is a 400 the user cannot explain, a dropped refusal body loses the cycle that names
 *   the cards to unlink, and a card without defaults would crash the Board against an older
 *   server.
 * Depends on: src/api/http/cards-http, helpers/fetch-stub.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { createCardsHttp } from '#/api/http/cards-http.js';
import { toNewCardInput, EMPTY_NEW_CARD } from '#/domain/new-card-form.js';
import { stubFetch } from '#tests/helpers/fetch-stub.js';

const row = {
  id: 'DCP-C2',
  project: 'dcp',
  type: 'plan',
  title: 'Retry failed webhooks',
  summary: '',
  source: { kind: 'chat', ref: 'web' },
  created_by: { type: 'user', id: 'owner' },
  created_at: '2026-10-16T10:00:00.000Z',
  updated_at: '2026-10-16T10:00:00.000Z',
  ticket_count: 0,
  tickets_done: 0,
  column: 'shaping',
};

const body = toNewCardInput(
  {
    ...EMPTY_NEW_CARD,
    title: 'Retry failed webhooks',
    description: 'Failed webhook sends should retry with backoff.',
    dependsOn: ['DCP-C1'],
  },
  '3f1c2b8e-6d1a-4c52-9a53-0b1f6f0c9a11',
);

describe('cards.create', () => {
  it('posts the body as given and reads the card from the 201', async () => {
    const stub = stubFetch({
      'POST /projects/:slug/cards': {
        status: 201,
        body: { card: { ...row, phase: 'grilling' } },
      },
    });

    const reply = await createCardsHttp({ baseUrl: '/api' }).create('dcp', body);

    expect(stub.calls[0]).toMatchObject({
      method: 'POST',
      path: '/projects/dcp/cards',
      body,
    });

    expect(reply.card.id).toBe('DCP-C2');
    expect(reply.card.phase).toBe('grilling');
  });

  it('reads the first card the same way when the key was already used (200)', async () => {
    stubFetch({ 'POST /projects/:slug/cards': { status: 200, body: { card: row } } });

    const reply = await createCardsHttp({ baseUrl: '/api' }).create('dcp', body);

    expect(reply.card.id).toBe('DCP-C2');
  });

  it('fills the card-flow fields for a server that does not send them', async () => {
    stubFetch({ 'POST /projects/:slug/cards': { status: 201, body: { card: row } } });

    const { card } = await createCardsHttp({ baseUrl: '/api' }).create('dcp', body);

    expect(card).toMatchObject({
      needs_you: false,
      phase_version: 0,
      priority: 'normal',
      links: [],
      depends_on: [],
      blocks: [],
    });

    expect(card.phase).toBeUndefined();
  });

  it('keeps the whole refusal body, so the cycle is still there', async () => {
    stubFetch({
      'POST /projects/:slug/cards': {
        status: 409,
        body: {
          error: { code: 'dependency_cycle', message: 'loop', cycle: ['A', 'B', 'A'] },
        },
      },
    });

    const error = await createCardsHttp({ baseUrl: '/api' })
      .create('dcp', body)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'dependency_cycle' });
    expect((error as ApiError).body).toMatchObject({ error: { cycle: ['A', 'B', 'A'] } });
  });

  it('writes the slug into the path safely', async () => {
    const stub = stubFetch({
      'POST /projects/:slug/cards': { status: 201, body: { card: row } },
    });

    await createCardsHttp({ baseUrl: '/api' }).create('a b/c', body);

    expect(stub.calls[0]?.path).toBe('/projects/a%20b%2Fc/cards');
  });
});

describe('cards.setRelations', () => {
  it('puts both lists and reads the card back', async () => {
    const stub = stubFetch({
      'PUT /cards/:id/relations': {
        body: { card: { ...row, depends_on: ['DCP-C1'], blocks: [] } },
      },
    });

    const { card } = await createCardsHttp({ baseUrl: '/api' }).setRelations('DCP-C2', {
      depends_on: ['DCP-C1'],
      blocks: [],
    });

    expect(stub.calls[0]).toMatchObject({
      method: 'PUT',
      path: '/cards/DCP-C2/relations',
      body: { depends_on: ['DCP-C1'], blocks: [] },
    });

    expect(card.depends_on).toEqual(['DCP-C1']);
  });
});
