/**
 * A loopback server over the real route table and in-memory storage, with two projects.
 *
 * Why: the stats, inbox and runs routes are read-mostly views over tickets, runs and
 *   interactions. Their tests need the same fixture each time (project `fixture` with prefix
 *   FX and project `other` with prefix OT, a fixed clock, an editable memory reader) and a
 *   handful of row builders; one rig keeps those tests about the route, not the wiring.
 *
 * Exports: NOW_MS, startReadRig(), ReadRig, makeTicket(), makeRun().
 * Depends on: @forge/db, src/routes/routes, helpers/http-rig, helpers/route-extras. IO: a loopback socket.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { MemoryListEntry, Project, Run, StorageAdapter, Ticket } from '@forge/core';
import type { Engine } from '@forge/engine';
import { vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertMemory, inertRouteExtras } from '#tests/helpers/route-extras.js';

export const NOW_MS = Date.parse('2026-10-16T12:00:00.000Z');

export interface ReadRig {
  readonly rig: HttpRig;
  readonly storage: StorageAdapter;
  /** What the memory reader lists for any project; change it per test. */
  proposals: MemoryListEntry[];
  close(): Promise<void>;
}

const project = (slug: string, prefix: string): Project => ({
  id: slug,
  slug,
  prefix,
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
});

export const makeTicket = (
  prefix: 'FX' | 'OT',
  n: number,
  over: Partial<Ticket> = {},
): Ticket => ({
  id: `${prefix}-${n}` as Ticket['id'],
  project: prefix === 'FX' ? 'fixture' : 'other',
  title: `Ticket ${n}`,
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'inbox',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: '2026-10-15T00:00:00.000Z',
  updated_at: '2026-10-15T00:00:00.000Z',
  blocked_by: [],
  ...over,
});

export const makeRun = (id: string, ticketId: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: ticketId,
  harness: 'claude',
  driver_version: '1',
  cwd: '/tmp/x',
  lane: 'express',
  started_at: '2026-10-16T01:00:00.000Z',
  status: 'success',
  owner: 'srv-test',
  ...over,
});

export async function startReadRig(): Promise<ReadRig> {
  const storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.projects.upsert(project('fixture', 'FX'));
    await tx.projects.upsert(project('other', 'OT'));
  });

  const state = { proposals: [] as MemoryListEntry[] };
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
      memory: {
        ...inertMemory,
        reader: { list: async () => state.proposals, get: async () => null },
      },
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now: () => NOW_MS,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );

  return {
    rig,
    storage,
    get proposals() {
      return state.proposals;
    },
    set proposals(v: MemoryListEntry[]) {
      state.proposals = v;
    },
    close: () => rig.close(),
  };
}
