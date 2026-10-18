/**
 * Tracked storage for research and budget writes: the live Evidence tab, run sources and Inbox.
 *
 * Why: the Evidence tab draws from `["card-evidence", id]`, a run's page list from `["run-sources", id]`, and the
 *   Inbox shows budget warnings; each must update within a second of the write that changed it, without any
 *   writer remembering to notify (d-0132). A Director source or new evidence announces the card's evidence and
 *   the card view; a Worker's page announces the run's sources; a `budget_warning` event and a change of a
 *   card's cap also announce the project's Inbox (the warnings show only for the cap in force). A rolled back
 *   write announces nothing.
 *
 * Pins: evidence insert, Director source insert, Worker source insert, budget warning, cap change and an
 *   ordinary card update (no Inbox key), rollback.
 * Depends on: src/services/{tracked-storage,project-events}, @forge/db (memory), vitest.
 */

import type { Card, CardId } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';

const T = '2026-10-18T00:00:00.000Z';
const CARD = 'FX-C1' as CardId;

const card: Card = {
  id: CARD,
  project: 'p1',
  type: 'issue',
  title: 'c',
  summary: 's',
  source: { kind: 'chat', ref: 'm' },
  created_by: { type: 'user', id: 'u1' },
  created_at: T,
  updated_at: T,
  phase: 'grilling',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
};

const page = {
  project: 'dcp',
  origin: 'director' as const,
  url: 'https://a.example/x',
  final_url: 'https://a.example/x',
  title: 'A',
  retrieved_at: T,
  sha256: 'a'.repeat(64),
  bytes: 1,
  truncated: false,
  text: 'x',
};

async function setup() {
  const raw = createMemoryStorage();
  const events = createProjectEvents();
  const seen: string[][] = [];
  events.subscribe('dcp', (keys) => seen.push(keys.map((k) => k.join(':')).sort()));
  await raw.transaction(async (tx) => {
    await tx.projects.upsert({
      id: 'p1',
      slug: 'dcp',
      prefix: 'FX',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    });

    await tx.cards.insert(card);
  });

  return { storage: trackProjectWrites(raw, events), seen };
}

const evidence = {
  step_id: 'research',
  origin: 'research_step' as const,
  claim: 'A claim long enough',
  quotes: [],
  sources: [],
  status: 'unverified' as const,
  created_at: T,
};

describe('research writes announce the Evidence tab and run sources', () => {
  it('announces new evidence and a Director source for the card', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) => tx.evidence.insertMany(CARD, [evidence]));
    await storage.transaction((tx) =>
      tx.researchSources.insert({ ...page, card_id: CARD, ref: 'S1' }),
    );

    const keys = ['card-evidence:FX-C1', 'card:FX-C1'].sort();
    expect(seen).toEqual([keys, keys]);
  });

  it('announces a Worker page for the run, under the project slug', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) =>
      tx.researchSources.insert({ ...page, origin: 'worker', run_id: 'run-9' }),
    );

    expect(seen).toEqual([['run-sources:run-9']]);
  });

  it('announces nothing for a rolled back write or a read', async () => {
    const { storage, seen } = await setup();

    await expect(
      storage.transaction(async (tx) => {
        await tx.evidence.insertMany(CARD, [evidence]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await storage.transaction((tx) => tx.evidence.listByCard(CARD));

    expect(seen).toEqual([]);
  });
});

describe('budget writes announce the Inbox', () => {
  it('announces the Inbox with a budget_warning event, and not with another event', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) =>
      tx.cardEvents.append(CARD, {
        kind: 'budget_warning',
        at: T,
        actor: { type: 'director', id: 'engine' },
        payload: { threshold: 0.8, spent_usd: 4, cap_usd: 5 },
      }),
    );

    await storage.transaction((tx) =>
      tx.cardEvents.append(CARD, {
        kind: 'note',
        at: T,
        actor: { type: 'director', id: 'engine' },
        payload: { text: 'hi' },
      }),
    );

    expect(seen[0]).toEqual(['card:FX-C1', 'cards:dcp', 'inbox:dcp']);
    expect(seen[1]).toEqual(['card:FX-C1', 'cards:dcp']);
  });

  it('announces the Inbox when a card cap changes, but not for another card update', async () => {
    const { storage, seen } = await setup();

    await storage.transaction((tx) =>
      tx.cards.update(CARD, { budget_cap_usd: 5, updated_at: T }),
    );

    await storage.transaction((tx) =>
      tx.cards.update(CARD, { title: 'new', updated_at: T }),
    );

    await storage.transaction((tx) =>
      tx.cards.update(CARD, { budget_cap_usd: undefined, updated_at: T }),
    );

    expect(seen).toEqual([
      ['card:FX-C1', 'cards:dcp', 'inbox:dcp'],
      ['card:FX-C1', 'cards:dcp'],
      ['card:FX-C1', 'cards:dcp', 'inbox:dcp'],
    ]);
  });
});
