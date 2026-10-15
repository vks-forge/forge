/**
 * Fixtures and a started HTTP rig for the card route tests.
 *
 * Why: the card reads and the card PATCH are tested in separate files (each stays readable),
 *   but both need the same project, card, ticket and question rows and the same route table
 *   over in-memory storage, so a change to a card fixture lands in one place.
 *
 * Exports: project(), at(), card(), ticket(), question(), startCardRig(), CardRig.
 * Depends on: src/routes/routes, helpers/http-rig, @forge/db (memory storage). IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type {
  Card,
  CardId,
  Interaction,
  Project,
  StorageAdapter,
  Ticket,
} from '@forge/core';
import type { Engine } from '@forge/engine';
import { vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

export interface CardRig {
  readonly rig: HttpRig;
  readonly storage: StorageAdapter;
  /** Inserts cards, then tickets. */
  seed(cards: Card[], tickets?: Ticket[]): Promise<void>;
}

export const project = (slug: string, prefix: string): Project => ({
  id: slug,
  slug,
  prefix,
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
});

export const at = (minute: number): string =>
  `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

export const card = (n: number, over: Partial<Card> = {}): Card => ({
  id: `FX-C${n}` as CardId,
  project: 'fixture',
  type: 'issue',
  title: `Card ${n}`,
  summary: 'summary',
  source: { kind: 'chat', ref: `msg-${n}` },
  created_by: { type: 'user', id: 'u1' },
  created_at: at(0),
  updated_at: at(n % 50),
  ...over,
});

export const ticket = (
  n: number,
  cardNumber: number,
  over: Partial<Ticket> = {},
): Ticket => ({
  id: `FX-${n}` as Ticket['id'],
  project: 'fixture',
  card_id: `FX-C${cardNumber}` as CardId,
  title: `Ticket ${n}`,
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: at(0),
  updated_at: at(1),
  blocked_by: [],
  ...over,
});

export const question = (ticketId: string): Interaction => ({
  id: `int-${ticketId}`,
  ticket_id: ticketId,
  kind: 'question',
  payload: { prompt: 'which?' },
  status: 'pending',
  asked_at: at(2),
  timeout_at: '2099-01-01T00:00:00.000Z',
});

/** Starts the production routes over fresh in-memory storage holding two projects, `fixture` (FX) and `other` (OT). */
export async function startCardRig(): Promise<CardRig> {
  const storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.projects.upsert(project('fixture', 'FX'));
    await tx.projects.upsert(project('other', 'OT'));
  });

  const rig = await startHttp(
    buildRoutes({
      ...stubHarnessDeps(),
      engine: {
        explainWait: vi.fn(async () => null),
        unservableProjects: vi.fn(() => new Map()),
      } as unknown as Engine,
      storage,
      config: createMemoryConfigSource(),
      ...inertRouteExtras(),
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => Date.parse(at(30)),
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );

  return {
    rig,
    storage,
    seed: (cards, tickets = []) =>
      storage.transaction(async (tx) => {
        for (const c of cards) {
          await tx.cards.insert(c);
        }

        for (const t of tickets) {
          await tx.tickets.insert(t);
        }
      }),
  };
}
