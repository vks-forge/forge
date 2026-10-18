/**
 * Contract cases for fetched research sources and card evidence.
 *
 * Why: the research step stores every page it fetches and the engine checks quotes against that text, so
 *   the store must number a card's sources and evidence itself, refuse a second `S1` on the same card
 *   (a step that reruns after a restart must not duplicate), keep page text capped in one place, find a
 *   Worker's sources by run (so a review can only cite pages its run fetched) and keep one card's rows apart
 *   from another's. Both backends are held to the same answers.
 *
 * Exports: describeResearchStorageContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_TEXT_CHARS } from '@forge/core';
import type { CardId, NewEvidence, NewResearchSource, StorageAdapter } from '@forge/core';
import { T0, makeProject, makeRun, makeTicket } from '#tests/helpers/fixtures.js';

const HASH = 'b'.repeat(64);
const CARD = 'SF-C1' as CardId;
const OTHER = 'SF-C2' as CardId;

const page = (over: Partial<NewResearchSource> = {}): NewResearchSource => ({
  project: 'sf',
  card_id: CARD,
  ref: 'S1',
  origin: 'director',
  url: 'https://example.com/a',
  final_url: 'https://example.com/a',
  title: 'Widget API',
  retrieved_at: T0,
  sha256: HASH,
  bytes: 11,
  truncated: false,
  text: 'hello world',
  ...over,
});

const claim = (over: Partial<NewEvidence> = {}): NewEvidence => ({
  step_id: 'research',
  origin: 'research_step',
  claim: 'The limit is 100 per minute',
  quotes: [{ source: 'S1', quote: 'rate limit is 100 requests per minute' }],
  sources: ['S1'],
  status: 'verified',
  created_at: T0,
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeResearchStorageContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  async function seedCards(): Promise<void> {
    await tx(async (t) => {
      await t.projects.upsert(makeProject('sf', { slug: 'sf' }));
      for (const id of [CARD, OTHER]) {
        await t.cards.insert({
          id,
          project: 'sf',
          type: 'issue',
          title: 'c',
          summary: 's',
          source: { kind: 'chat', ref: 'm' },
          created_by: { type: 'user', id: 'u1' },
          created_at: T0,
          updated_at: T0,
          phase: 'grilling',
          phase_version: 0,
          needs_you: false,
          priority: 'normal',
          links: [],
        });
      }
    });
  }

  describe('research sources', () => {
    it('numbers a card sources from S1 and reads them back in ref order without the text', async () => {
      await seedCards();

      expect(await tx((t) => t.researchSources.nextRef(CARD))).toBe('S1');
      await tx((t) => t.researchSources.insert(page({ ref: 'S2' })));
      const first = await tx((t) => t.researchSources.insert(page({ ref: 'S1' })));

      expect(await tx((t) => t.researchSources.nextRef(CARD))).toBe('S3');
      expect(await tx((t) => t.researchSources.nextRef(OTHER))).toBe('S1');
      expect(first).toMatchObject({ ref: 'S1', origin: 'director', truncated: false });
      expect(first).not.toHaveProperty('text');

      const list = await tx((t) => t.researchSources.listByCard(CARD));
      expect(list.map((s) => s.ref)).toEqual(['S1', 'S2']);
      expect(list.every((s) => !('text' in s))).toBe(true);
    });

    it('refuses a second source with the same ref on a card, so a rerun cannot duplicate S1', async () => {
      await seedCards();
      await tx((t) => t.researchSources.insert(page()));

      await expect(tx((t) => t.researchSources.insert(page()))).rejects.toThrow();
      await tx((t) => t.researchSources.insert(page({ card_id: OTHER })));
      expect(await tx((t) => t.researchSources.listByCard(CARD))).toHaveLength(1);
    });

    it('caps the stored text, keeps the hash, marks the source truncated and cuts the title', async () => {
      await seedCards();
      const long = 'x'.repeat(MAX_SOURCE_TEXT_CHARS + 50);

      const stored = await tx((t) =>
        t.researchSources.insert(page({ text: long, title: 't'.repeat(500) })),
      );

      expect(stored.truncated).toBe(true);
      expect(stored.sha256).toBe(HASH);
      expect(stored.title).toHaveLength(300);
      expect(await tx((t) => t.researchSources.text(stored.id))).toHaveLength(
        MAX_SOURCE_TEXT_CHARS,
      );
    });

    it('serves text by id and by card ref, and null for an unknown one', async () => {
      await seedCards();
      const s = await tx((t) => t.researchSources.insert(page()));

      expect(await tx((t) => t.researchSources.text(s.id))).toBe('hello world');
      expect(await tx((t) => t.researchSources.text(9999))).toBeNull();
      expect(await tx((t) => t.researchSources.getByRef(CARD, 'S1'))).toEqual({
        source: s,
        text: 'hello world',
      });

      expect(await tx((t) => t.researchSources.getByRef(CARD, 'S7'))).toBeNull();
      expect(await tx((t) => t.researchSources.getByRef(OTHER, 'S1'))).toBeNull();
    });

    it('stores a Worker source with a run and no card ref and finds it by run', async () => {
      await tx(async (t) => {
        await t.projects.upsert(makeProject('sf', { slug: 'sf' }));
        await t.tickets.insert(makeTicket(1, { project: 'sf' }));
        await t.runs.insert(
          makeRun('run-1', { ticket_id: makeTicket(1).id, project: 'sf' }),
        );
      });

      const worker = page({
        origin: 'worker',
        card_id: undefined as never,
        ref: undefined as never,
        ticket_id: makeTicket(1).id,
        run_id: 'run-1',
      });

      const { card_id: _c, ref: _r, ...clean } = worker;
      void _c;
      void _r;
      await tx((t) => t.researchSources.insert(clean));
      await tx((t) =>
        t.researchSources.insert({ ...clean, url: 'https://example.com/b' }),
      );

      const byRun = await tx((t) => t.researchSources.listByRun('run-1'));
      expect(byRun.map((s) => s.url)).toEqual([
        'https://example.com/a',
        'https://example.com/b',
      ]);

      expect(byRun[0]).toMatchObject({ origin: 'worker', run_id: 'run-1' });
      expect(await tx((t) => t.researchSources.listByRun('other'))).toEqual([]);
    });
  });

  describe('card evidence', () => {
    it('numbers evidence from E1 across inserts and keeps one card apart from another', async () => {
      await seedCards();

      const first = await tx((t) =>
        t.evidence.insertMany(CARD, [
          claim(),
          claim({ status: 'unverified', quotes: [] }),
        ]),
      );

      const second = await tx((t) =>
        t.evidence.insertMany(CARD, [claim({ claim: 'Another long claim' })]),
      );

      const other = await tx((t) => t.evidence.insertMany(OTHER, [claim()]));

      expect(first.map((e) => e.ref)).toEqual(['E1', 'E2']);
      expect(second.map((e) => e.ref)).toEqual(['E3']);
      expect(other.map((e) => e.ref)).toEqual(['E1']);
      expect(first[0]).toMatchObject({
        card_id: CARD,
        step_id: 'research',
        origin: 'research_step',
        status: 'verified',
        sources: ['S1'],
      });

      expect((await tx((t) => t.evidence.listByCard(CARD))).map((e) => e.ref)).toEqual([
        'E1',
        'E2',
        'E3',
      ]);
    });

    it('counts by card and by origin', async () => {
      await seedCards();
      await tx((t) =>
        t.evidence.insertMany(CARD, [
          claim(),
          claim({ origin: 'grill_detour', question: 'What is the limit?' }),
        ]),
      );

      expect(await tx((t) => t.evidence.count(CARD))).toBe(2);
      expect(await tx((t) => t.evidence.count(CARD, 'grill_detour'))).toBe(1);
      expect(await tx((t) => t.evidence.count(CARD, 'research_step'))).toBe(1);
      expect(await tx((t) => t.evidence.count(OTHER))).toBe(0);
    });

    it('keeps the question on a row and rolls back with the transaction', async () => {
      await seedCards();

      await expect(
        tx(async (t) => {
          await t.evidence.insertMany(CARD, [claim({ question: 'Why?' })]);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.evidence.count(CARD))).toBe(0);

      const [row] = await tx((t) =>
        t.evidence.insertMany(CARD, [claim({ question: 'Why?' })]),
      );

      expect(row?.question).toBe('Why?');
    });
  });
}
