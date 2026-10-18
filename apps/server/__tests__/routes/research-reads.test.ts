/**
 * `GET /cards/:id/evidence`, `GET /cards/:id/sources/:ref` and `GET /runs/:id/sources`.
 *
 * Why: the owner reads what the Director found outside the repository as the engine checked it: each claim
 *   with a verified or unverified verdict, its verified quotes and where it came from, and the stored page text
 *   behind a source so a quote can be checked by eye (d-0144). The text must only be served for a source the
 *   card itself fetched, never another card's, and a Worker's pages are listed by run so a review can be read
 *   next to what its run read. Every unknown card, source or run is a clear 404.
 *
 * Pins: the evidence reply (views joined to sources, runs used from the `research` events, the cap in force),
 *   source text by ref and its 404s, a source of another card never served, the run's sources, invalid ids.
 * Depends on: helpers/card-rig, @forge/db (memory config), vitest. IO: a loopback socket.
 */

import { createMemoryConfigSource } from '@forge/db';
import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;
const get = (path: string) => ctx.rig.json('GET', path);

const page = (over: Record<string, unknown> = {}) => ({
  project: 'fixture',
  card_id: 'FX-C1' as CardId,
  ref: 'S1',
  origin: 'director' as const,
  url: 'https://docs.example.com/widget',
  final_url: 'https://docs.example.com/widget/final',
  title: 'Widget API',
  retrieved_at: at(5),
  sha256: 'a'.repeat(64),
  bytes: 70,
  truncated: false,
  text: 'The Widget API has a rate limit of 100 requests per minute <script>alert(1)</script>',
  ...over,
});

beforeEach(async () => {
  ctx = await startCardRig({}, { config: createMemoryConfigSource() });
  await ctx.seed([card(1), card(2)]);
  await ctx.storage.transaction(async (tx) => {
    await tx.researchSources.insert(page());
    await tx.researchSources.insert(
      page({ card_id: 'FX-C2' as CardId, text: 'the other card text' }),
    );

    await tx.evidence.insertMany('FX-C1' as CardId, [
      {
        step_id: 'research',
        origin: 'research_step',
        question: 'What is the limit?',
        claim: 'The Widget API allows 100 requests per minute.',
        quotes: [{ source: 'S1', quote: 'rate limit of 100 requests per minute' }],
        sources: ['S1'],
        status: 'verified',
        created_at: at(6),
      },
      {
        step_id: 'research',
        origin: 'research_step',
        claim: 'It is free forever for everyone.',
        quotes: [],
        sources: [],
        status: 'unverified',
        created_at: at(6),
      },
    ]);

    for (const n of [1, 2]) {
      await tx.cardEvents.append('FX-C1' as CardId, {
        kind: 'research',
        at: at(5 + n),
        actor: { type: 'director', id: 'engine' },
        payload: {
          step_id: 'research',
          origin: n === 1 ? 'research_step' : 'grill_detour',
          searches: [],
          fetched: [],
          claims: [],
          unanswered: [],
          cost_usd: 0.1,
        },
      });
    }
  });
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /cards/:id/evidence', () => {
  it('answers the evidence with its sources, the runs used and the cap in force', async () => {
    const res = await get('/cards/FX-C1/evidence');

    expect(res.status).toBe(200);
    const body = res.body as {
      evidence: {
        ref: string;
        status: string;
        source_list: { ref: string; url: string }[];
      }[];
      sources: { ref: string }[];
      runs_used: number;
      runs_cap: number;
    };

    expect(body.evidence.map((e) => [e.ref, e.status])).toEqual([
      ['E1', 'verified'],
      ['E2', 'unverified'],
    ]);

    expect(body.evidence[0]?.source_list).toEqual([
      {
        ref: 'S1',
        url: 'https://docs.example.com/widget',
        final_url: 'https://docs.example.com/widget/final',
        title: 'Widget API',
        retrieved_at: at(5),
      },
    ]);

    expect(body.sources.map((s) => s.ref)).toEqual(['S1']);
    expect(body.sources[0]).not.toHaveProperty('text');
    expect(body.runs_used).toBe(2);
    expect(body.runs_cap).toBe(4);
  });

  it('answers an empty reply for a card that never researched, and 404 for an unknown or malformed card', async () => {
    const empty = await get('/cards/FX-C2/evidence');
    expect(empty.body).toMatchObject({ evidence: [], runs_used: 0, runs_cap: 4 });

    expect((await get('/cards/FX-C99/evidence')).status).toBe(404);
    expect((await get('/cards/FX-C99/evidence')).body).toMatchObject({
      error: { code: 'card_not_found' },
    });

    expect((await get('/cards/nonsense/evidence')).status).toBe(400);
  });
});

describe('GET /cards/:id/sources/:ref', () => {
  it('serves the stored text of the card source as plain text in a JSON field', async () => {
    const res = await get('/cards/FX-C1/sources/S1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      source: { ref: 'S1', title: 'Widget API', origin: 'director' },
      text: expect.stringContaining('<script>alert(1)</script>'),
    });
  });

  it('never serves another card source, an unknown ref or a malformed ref', async () => {
    expect((await get('/cards/FX-C1/sources/S2')).body).toMatchObject({
      error: { code: 'source_not_found' },
    });

    expect((await get('/cards/FX-C1/sources/x1')).status).toBe(404);
    expect((await get('/cards/FX-C99/sources/S1')).body).toMatchObject({
      error: { code: 'card_not_found' },
    });

    const other = (await get('/cards/FX-C2/sources/S1')).body as { text: string };
    expect(other.text).toBe('the other card text');
  });
});

describe('GET /runs/:id/sources', () => {
  it('lists the pages a run read, and 404s an unknown run', async () => {
    await ctx.storage.transaction(async (tx) => {
      await tx.runs.insert({
        id: 'run-1',
        ticket_id: 'FX-1',
        harness: 'fake',
        driver_version: '0',
        cwd: '/tmp',
        lane: 'standard',
        started_at: at(1),
        status: 'running',
        owner: 'srv',
      });

      await tx.researchSources.insert({
        ...page(),
        origin: 'worker',
        card_id: undefined as never,
        ref: undefined as never,
        run_id: 'run-1',
        ticket_id: 'FX-1' as never,
      });
    });

    const res = await get('/runs/run-1/sources');
    expect(res.status).toBe(200);
    expect(
      (res.body as { sources: { origin: string; run_id: string }[] }).sources,
    ).toEqual([expect.objectContaining({ origin: 'worker', run_id: 'run-1' })]);

    expect((await get('/runs/nope/sources')).body).toMatchObject({
      error: { code: 'run_not_found' },
    });
  });
});
