/**
 * In-memory MemoryRepository: records, moves, aids and a naive search, assembled with its reads and log.
 *
 * Why: engine and server tests run on this backend, so the guarantees of SQLite must hold here too: a
 *   record is parsed with the core schema on the way in, ids count up per letter, a record moves only along
 *   approve / reject / supersede, history is numbered by storage alone, scope (project, status, kind, tags,
 *   rejected approaches) is applied while searching, and a rolled-back transaction leaves nothing behind
 *   because everything lives in `MemoryState`. Search is a plain term-overlap scorer (see
 *   memory-naive-search): enough for tests to run without SQLite, never a claim about ranking quality, which
 *   is pinned on SQLite only. There are no triggers here; the writer rules are the code.
 *
 * Exports: memoryMemory().
 * Depends on: @forge/core, adapters/memory/memory-{log,reads,naive-search}, types/memory-state.types. No IO.
 */

import {
  InvalidInputError,
  MemoryRecordNotFoundError,
  MemoryRecordStateError,
  MemoryRow,
  MemoryTag,
  scopeAdmits,
  wordsOf,
} from '@forge/core';
import type { MemoryRepository } from '@forge/core';
import { memoryMemoryLog } from '#/adapters/memory/memory-log.js';
import {
  recordWords,
  scoreRecord,
  snippetOf,
} from '#/adapters/memory/memory-naive-search.js';
import { memoryMemoryReads } from '#/adapters/memory/memory-reads.js';
import type { MemoryState } from '#/types/memory-state.types.js';

const key = (project: string, id: string): string => JSON.stringify([project, id]);

const EDGES = {
  approve: {
    from: ['proposal', 'pending'],
    to: ['decision', 'active'],
    label: 'a pending proposal',
  },
  reject: {
    from: ['proposal', 'pending'],
    to: ['rejected', 'rejected'],
    label: 'a pending proposal',
  },
  supersede: {
    from: ['decision', 'active'],
    to: ['decision', 'superseded'],
    label: 'an active decision',
  },
} as const;

export function memoryMemory(state: MemoryState): MemoryRepository {
  const rowOf = (project: string, id: string): MemoryRow | undefined =>
    state.memoryRows.get(key(project, id));

  const projectRows = (project: string): MemoryRow[] =>
    [...state.memoryRows.values()].filter((r) => r.project === project);

  const tagsFor = (project: string, id: string): string[] =>
    state.memoryTags.get(key(project, id)) ?? [];

  const addEvent = (
    project: string,
    id: string,
    e: Omit<MemoryState['memoryEvents'][number], 'seq' | 'id' | 'project'>,
  ): number => {
    state.memoryEventSeq += 1;
    state.memoryEvents.push({ ...e, seq: state.memoryEventSeq, id, project });

    return state.memoryEventSeq;
  };

  return {
    ...memoryMemoryReads(state),
    ...memoryMemoryLog(state),

    async insertRecord(rowIn, tagsIn, links, event) {
      const row = MemoryRow.parse(rowIn);
      const tags = [...new Set(tagsIn.map((t) => MemoryTag.parse(t)))].sort();
      if (rowOf(row.project, row.id)) {
        throw new InvalidInputError(
          `memory record ${row.id} already exists in ${row.project}`,
        );
      }

      state.memoryRows.set(key(row.project, row.id), structuredClone(row));
      state.memoryTags.set(key(row.project, row.id), tags);
      for (const l of links) {
        const dup = state.memoryLinks.some(
          (x) =>
            x.project === row.project &&
            x.from_id === row.id &&
            x.rel === l.rel &&
            x.target === l.target,
        );

        if (!dup) {
          state.memoryLinks.push({ ...l, from_id: row.id, project: row.project });
        }
      }

      return addEvent(row.project, row.id, event);
    },

    async transition(project, id, edge, fields, event) {
      const row = rowOf(project, id);
      if (!row) {
        throw new MemoryRecordNotFoundError(id);
      }

      const rule = EDGES[edge];
      if (row.kind !== rule.from[0] || row.status !== rule.from[1]) {
        throw new MemoryRecordStateError(
          id,
          `${id} is not ${rule.label} (it is ${row.kind}, ${row.status})`,
        );
      }

      state.memoryRows.set(key(project, id), {
        ...row,
        ...structuredClone(fields),
        kind: rule.to[0],
        status: rule.to[1],
      } as MemoryRow);

      return addEvent(project, id, event);
    },

    async setAids(project, id, aids, actor, at) {
      const row = rowOf(project, id);
      if (!row) {
        throw new MemoryRecordNotFoundError(id);
      }

      const next = MemoryRow.pick({ gist: true, aliases: true, pinned: true }).parse(
        aids,
      );

      state.memoryRows.set(key(project, id), { ...row, ...structuredClone(next) });
      const version =
        Math.max(
          0,
          ...state.memoryVersions
            .filter((v) => v.project === project && v.id === id)
            .map((v) => v.version),
        ) + 1;

      state.memoryVersions.push({
        project,
        id,
        version,
        at,
        actor,
        gist: next.gist,
        aliases: next.aliases.join('\n'),
        pinned: next.pinned,
      });

      addEvent(project, id, {
        at,
        actor,
        event: 'aids_set',
        from_status: row.status,
        to_status: row.status,
        reason: null,
      });
    },

    async nextId(project, letter) {
      if (!/^[a-z]$/.test(letter)) {
        throw new InvalidInputError(
          `id letter must be one lower-case letter, got ${letter}`,
        );
      }

      const highest = Math.max(
        0,
        ...projectRows(project)
          .filter((r) => r.id.startsWith(`${letter}-`))
          .map((r) => Number(r.id.slice(2))),
      );

      return `${letter}-${String(highest + 1).padStart(4, '0')}`;
    },

    async searchLexical({ project, match, scope, limit, snippet }) {
      if (match.trim() === '' || scope.kinds.length === 0 || scope.status.length === 0) {
        return [];
      }

      return projectRows(project)
        .filter((r) =>
          scopeAdmits(scope, {
            kind: r.kind,
            status: r.status,
            tags: tagsFor(project, r.id),
          }),
        )
        .flatMap((r) => {
          const score = scoreRecord(r, tagsFor(project, r.id), match);

          return score === null
            ? []
            : [{ id: r.id, score, snippet: snippet ? snippetOf(r, match) : null }];
        })
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
        .slice(0, limit);
    },

    async documentFrequency(project, terms) {
      const out: Record<string, number> = {};
      for (const term of terms) {
        const word = wordsOf(term).join(' ');
        out[term] = projectRows(project).filter((r) =>
          Object.values(recordWords(r, tagsFor(project, r.id))).some((words) =>
            words.includes(word),
          ),
        ).length;
      }

      return out;
    },

    async reindex() {
      // Search reads the rows directly; there is no separate index to rebuild.
    },
  };
}
