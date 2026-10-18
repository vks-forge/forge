/**
 * A fake MemoryIndex for the memory tool tests: it applies the scope it is given and records every call.
 *
 * Why: the memory tools must prove two things the real index also promises: they pass the scope the server
 *   built (never one a Worker sent) and they leave the run and ticket on every call so the access log can
 *   say who looked. This fake enforces the scope with the same core rule (`scopeAdmits`) over a small
 *   in-memory list, so a tool that forgot to pass the scope, or widened it, shows up as a leaked record.
 *   It does not import the memory package: the tools depend on the port only.
 *
 * Exports: FakeRecord, FakeMemory, fakeMemory(), workerMemory().
 * Depends on: @forge/core, helpers/harness (types only). No IO.
 */

import { narrowScope, scopeAdmits, wordsOf } from '@forge/core';
import type {
  MemoryAuthor,
  MemoryIndex,
  MemoryKind,
  MemoryOrigin,
  MemoryReadOptions,
  MemoryRecordView,
  MemoryRelated,
  MemoryScope,
  MemorySearchQuery,
  MemoryStatus,
} from '@forge/core';
import type { WorkerMemoryScope } from '#/types/deps.types.js';

export interface FakeRecord {
  readonly project: string;
  readonly id: string;
  readonly kind: MemoryKind;
  readonly status: MemoryStatus;
  readonly statement: string;
  readonly body?: string;
  readonly tags?: readonly string[];
  readonly author?: MemoryAuthor;
  readonly origin?: MemoryOrigin;
}

/** What the fake saw: the query with its scope, or the read options of get and related. */
export interface FakeMemory {
  readonly index: MemoryIndex;
  readonly searches: MemorySearchQuery[];
  readonly gets: { ids: readonly string[]; opts: MemoryReadOptions }[];
  readonly relateds: { id: string; k: number; opts: MemoryReadOptions }[];
}

const view = (r: FakeRecord): MemoryRecordView => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  statement: r.statement,
  body: r.body ?? '',
  body_truncated: false,
  tags: [...(r.tags ?? [])],
  source: { type: 'chat', ref: 'owner' },
  author: r.author ?? 'user',
  origin: r.origin ?? 'owner',
  confidence: null,
  pinned: false,
  valid_from: '2026-10-18',
  valid_to: null,
  supersedes: null,
  superseded_by: null,
  gist: null,
  aliases: [],
  links: [],
  imported: null,
});

const refuse = (what: string) => async (): Promise<never> => {
  throw new Error(`fake memory: ${what} is not used by the tools`);
};

/** `related` answers with every other record the scope admits, for the first record only if `neighbours` says so. */
export function fakeMemory(
  records: readonly FakeRecord[],
  neighbours: readonly MemoryRelated[] = [],
): FakeMemory {
  const searches: MemorySearchQuery[] = [];
  const gets: FakeMemory['gets'] = [];
  const relateds: FakeMemory['relateds'] = [];

  const visible = (project: string, opts: MemoryReadOptions, extra?: MemoryScope) => {
    const scope = opts.scope ?? {
      kinds: [],
      status: [],
      tags: [],
      include_rejected: false,
    };

    const narrowed = extra ? narrowScope(scope, extra) : scope;

    return records.filter(
      (r) =>
        r.project === project &&
        scopeAdmits(narrowed, { kind: r.kind, status: r.status, tags: r.tags ?? [] }),
    );
  };

  const index: MemoryIndex = {
    async search(query) {
      searches.push(query);
      const scope = query.scope ?? {
        kinds: [],
        status: [],
        tags: [],
        include_rejected: false,
      };

      const narrowed = narrowScope(scope, {
        kinds: query.kinds,
        tags: query.tags,
      });

      const words = wordsOf(query.text ?? '');
      const hits = records
        .filter(
          (r) =>
            r.project === query.project &&
            scopeAdmits(narrowed, {
              kind: r.kind,
              status: r.status,
              tags: r.tags ?? [],
            }) &&
            words.some((w) => wordsOf(r.statement).includes(w)),
        )
        .slice(0, query.k ?? 8)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          line: r.statement.slice(0, 160),
          tags: [...(r.tags ?? [])],
          why: 'statement' as const,
          score: 1,
        }));

      return { hits, total: hits.length, truncated: false };
    },

    async get(project, ids, opts) {
      gets.push({ ids, opts });
      const seen = visible(project, opts);
      const found = ids.flatMap((id) => seen.filter((r) => r.id === id).map(view));

      return {
        records: found,
        missing: ids.filter((id) => !seen.some((r) => r.id === id)),
      };
    },

    async related(project, id, k, opts) {
      relateds.push({ id, k, opts });
      if (!visible(project, opts).some((r) => r.id === id)) {
        return null;
      }

      return neighbours.slice(0, k);
    },

    list: refuse('list'),
    digest: refuse('digest'),
    rejected: refuse('rejected'),
    pinned: refuse('pinned'),
    decisions: refuse('decisions'),
    history: refuse('history'),
  };

  return { index, searches, gets, relateds };
}

/** The deps a driver-side server would supply for a run of `project` with the given scope. */
export function workerMemory(
  fake: FakeMemory,
  scope: MemoryScope,
  project = 'forge',
): {
  memory: MemoryIndex;
  memoryScope: (runId: string) => Promise<WorkerMemoryScope | null>;
} {
  return {
    memory: fake.index,
    memoryScope: async (runId) =>
      runId === 'run-1' ? { project, scope, ticket_id: 'SF-1' } : null,
  };
}
