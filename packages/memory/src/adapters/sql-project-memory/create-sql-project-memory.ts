/**
 * Database-backed project memory — the Director's writer and the read side, one door for every write.
 *
 * Why: a project's memory is what the Director plans against and what Workers are told not to contradict, so
 *   it is written by exactly one party on the owner's word and never edited: a change is a new record or one of
 *   three moves (approve, reject, supersede). This is the same contract the git-backed memory kept
 *   (propose, decide, approve, reject, supersede, append an outcome), now stored in the database: each call
 *   is one transaction that writes the record, its tags and links, its history entry and its search-index
 *   entry together, ids never repeat, and the storage triggers hold the same rules a second time. The
 *   `commit` a write returns is the sequence number of its history entry. Reads show only committed state.
 *
 * Exports: createSqlProjectMemory().
 * Depends on: @forge/core, domain/row-plans, types/sql-memory. IO: the injected storage only.
 */

import {
  InvalidInputError,
  MemoryRecordNotFoundError,
  MemoryRecordStateError,
} from '@forge/core';
import type {
  MemoryListEntry,
  MemoryRecordWithBody,
  MemoryRow,
  MemoryWriteResult,
  MemoryWriter,
  ProjectMemory,
  StorageTx,
} from '@forge/core';
import { planDecision, planOutcome, planProposal } from '#/domain/row-plans.js';
import type { RowWrite, SqlMemoryDeps } from '#/types/sql-memory.types.js';

const SLUG = /^[a-z][a-z0-9-]*$/;
const RANK = { proposal: 0, decision: 1, rejected: 2, outcome: 3 } as const;

const slugOf = (slug: string): string => {
  if (!SLUG.test(slug)) {
    throw new InvalidInputError(`invalid project slug ${JSON.stringify(slug)}`);
  }

  return slug;
};

const result = (id: string, seq: number): MemoryWriteResult => ({
  id,
  commit: String(seq),
});

/** A stored record as the record API returns it: the schema fields plus the body. */
function toRecord(
  row: MemoryRow,
  tags: readonly string[],
  supersedes: string | null,
): MemoryRecordWithBody {
  return {
    id: row.id,
    kind: row.kind,
    statement: row.statement,
    source: { type: row.source_type, ref: row.source_ref },
    author: row.author,
    origin: row.origin,
    status: row.status,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    superseded_by: row.superseded_by,
    supersedes,
    ...(row.approved_at === null ? {} : { approved_at: row.approved_at }),
    ...(row.approved_by === null ? {} : { approved_by: row.approved_by }),
    ...(row.rejected_at === null ? {} : { rejected_at: row.rejected_at }),
    ...(row.rejected_by === null ? {} : { rejected_by: row.rejected_by }),
    ...(row.rejected_reason === null ? {} : { rejected_reason: row.rejected_reason }),
    ...(row.confidence === null ? {} : { confidence: row.confidence }),
    tags: [...tags],
    pinned: row.pinned,
    body: row.body,
  };
}

export function createSqlProjectMemory(deps: SqlMemoryDeps): ProjectMemory {
  const at = (): string => deps.now().toISOString();

  /** Allocates the id, stores the plan and returns the history entry's number. */
  async function store(
    tx: StorageTx,
    project: string,
    letter: string,
    plan: (id: string) => RowWrite,
  ): Promise<{ id: string; seq: number }> {
    const id = await tx.memory.nextId(project, letter);
    const w = plan(id);

    return { id, seq: await tx.memory.insertRecord(w.row, w.tags, w.links, w.event) };
  }

  const writer: MemoryWriter = {
    propose: (slug, input) =>
      deps.storage.transaction(async (tx) => {
        const project = slugOf(slug);
        const when = at();
        const { id, seq } = await store(tx, project, 'x', (i) =>
          planProposal(project, i, when, input),
        );

        return result(id, seq);
      }),

    decide: (slug, input) =>
      deps.storage.transaction(async (tx) => {
        const project = slugOf(slug);
        const when = at();
        const { id, seq } = await store(tx, project, 'd', (i) =>
          planDecision(project, i, when, input),
        );

        return result(id, seq);
      }),

    approve: (slug, id, by) =>
      deps.storage.transaction(async (tx) => {
        const project = slugOf(slug);
        const when = at();
        const seq = await tx.memory.transition(
          project,
          id,
          'approve',
          { approved_at: when, approved_by: by },
          {
            at: when,
            actor: by,
            event: 'approved',
            from_status: 'pending',
            to_status: 'active',
            reason: null,
          },
        );

        return result(id, seq);
      }),

    reject: (slug, id, reason, by) =>
      deps.storage.transaction(async (tx) => {
        const project = slugOf(slug);
        const why = reason.trim();
        if (why === '') {
          throw new InvalidInputError('a rejection needs a reason');
        }

        const when = at();
        const seq = await tx.memory.transition(
          project,
          id,
          'reject',
          { rejected_at: when, rejected_by: by, rejected_reason: why },
          {
            at: when,
            actor: by,
            event: 'rejected',
            from_status: 'pending',
            to_status: 'rejected',
            reason: why,
          },
        );

        return result(id, seq);
      }),

    supersede: (slug, oldId, input) =>
      deps.storage.transaction(async (tx) => {
        const project = slugOf(slug);
        const old = await tx.memory.get(project, oldId);
        if (old === null) {
          throw new MemoryRecordNotFoundError(oldId);
        }

        if (old.kind !== 'decision' || old.status !== 'active') {
          throw new MemoryRecordStateError(
            oldId,
            `${oldId} is not an active decision (it is ${old.kind}, ${old.status})`,
          );
        }

        const when = at();
        const created = await store(tx, project, 'd', (i) =>
          planDecision(project, i, when, input, oldId),
        );

        await tx.memory.transition(
          project,
          oldId,
          'supersede',
          { superseded_by: created.id, valid_to: when },
          {
            at: when,
            actor: 'user',
            event: 'superseded',
            from_status: 'active',
            to_status: 'superseded',
            reason: `superseded by ${created.id}`,
          },
        );

        return result(created.id, created.seq);
      }),

    appendOutcome: (slug, text) =>
      deps.storage.transaction(async (tx) => {
        const project = slugOf(slug);
        const when = at();
        const { id, seq } = await store(tx, project, 'o', (i) =>
          planOutcome(project, i, when, text),
        );

        return result(id, seq);
      }),
  };

  return {
    async init(slug) {
      slugOf(slug);
    },

    reader: {
      async list(slug): Promise<readonly MemoryListEntry[]> {
        if (!SLUG.test(slug)) {
          return [];
        }

        return deps.storage.transaction(async (tx) => {
          const rows = (await tx.memory.list(slug)).filter((r) => r.kind !== 'outcome');
          const tags = await tx.memory.tagsOf(
            slug,
            rows.map((r) => r.id),
          );

          return rows
            .sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.id < b.id ? -1 : 1))
            .map((r) => ({
              id: r.id,
              kind: r.kind,
              status: r.status,
              statement: r.statement,
              tags: tags[r.id] ?? [],
              pinned: r.pinned,
              imported: r.imported_from !== null,
            }));
        });
      },

      async get(slug, id): Promise<MemoryRecordWithBody | null> {
        if (!SLUG.test(slug)) {
          return null;
        }

        return deps.storage.transaction(async (tx) => {
          const row = await tx.memory.get(slug, id);
          if (row === null) {
            return null;
          }

          const links = await tx.memory.linksOf(slug, id);
          const tags = await tx.memory.tagsOf(slug, [id]);

          return toRecord(
            row,
            tags[id] ?? [],
            links.out.find((l) => l.rel === 'supersedes')?.target ?? null,
          );
        });
      },
    },

    writer,
  };
}
