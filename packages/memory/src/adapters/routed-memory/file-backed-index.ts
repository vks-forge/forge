/**
 * A MemoryIndex over a project that is still read from its old git repository.
 *
 * Why: a project whose import is not yet verified keeps working from its markdown files, and the Director and
 *   the screen must keep working for it. They ask the same index; for such a project it answers from the
 *   active slice of the files (decisions and rejected approaches) with a plain keyword filter, no ranking,
 *   no links and no history. It says only what the files say, and it never invents what they do not hold
 *   (there is no pinned flag in a slice, so none is reported). When the import is verified the routed
 *   memory switches the project to the database index and this one is no longer asked.
 *
 * Exports: createFileBackedIndex().
 * Depends on: @forge/core. IO: through the file-backed ports given.
 */

import { extractTerms, scopeAdmits, wordsOf } from '@forge/core';
import type {
  MemoryDigest,
  MemoryHit,
  MemoryIndex,
  MemoryListEntry,
  MemoryRecordRef,
  MemoryRecordView,
  MemoryScope,
  MemorySource,
  ProjectMemory,
} from '@forge/core';
import { baseScope, searchScope } from '#/adapters/sql-memory-index/scopes.js';
import { lineOf } from '#/adapters/sql-memory-index/views.js';

const BODY_CAP = 4000;

const byId = (a: MemoryRecordRef, b: MemoryRecordRef): number => (a.id < b.id ? 1 : -1);

export function createFileBackedIndex(
  source: MemorySource,
  memory: ProjectMemory,
): MemoryIndex {
  const slice = async (project: string, scope?: MemoryScope) => {
    const s = await source.slice(project);
    const keep = (r: MemoryRecordRef): boolean =>
      scope === undefined ||
      scope.tags.length === 0 ||
      (r.tags ?? []).some((t) => scope.tags.includes(t));

    return {
      decisions: s.decisions.filter(keep).sort(byId),
      rejected:
        scope !== undefined && !scope.include_rejected
          ? []
          : s.rejected.filter(keep).sort(byId),
    };
  };

  return {
    async search(q) {
      const scope = searchScope(baseScope(q.actor, q.scope), {
        kinds: q.kinds,
        status: q.status,
        tags: q.tags,
      });

      const terms = q.terms?.length ? q.terms : extractTerms(q.text ?? '');
      const wanted = [...terms, ...(q.synonyms ?? [])].flatMap((t) => wordsOf(t));
      const s = await slice(q.project, scope);
      const pool: { r: MemoryRecordRef; kind: 'decision' | 'rejected' }[] = [
        ...(scope.kinds.includes('decision')
          ? s.decisions.map((r) => ({ r, kind: 'decision' as const }))
          : []),
        ...(scope.kinds.includes('rejected')
          ? s.rejected.map((r) => ({ r, kind: 'rejected' as const }))
          : []),
      ];

      const ranked = pool
        .map((p) => {
          const words = new Set([
            ...wordsOf(p.r.statement),
            ...(p.r.tags ?? []).flatMap((t) => wordsOf(t)),
          ]);

          return { ...p, score: wanted.filter((w) => words.has(w)).length };
        })
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score || (a.r.id < b.r.id ? 1 : -1));

      const k = q.k ?? 8;
      const offset = q.offset ?? 0;
      const hits: MemoryHit[] = ranked.slice(offset, offset + k).map((p) => ({
        id: p.r.id,
        kind: p.kind,
        status: p.kind === 'rejected' ? 'rejected' : 'active',
        line: lineOf(
          { gist: null, statement: p.r.statement } as Parameters<typeof lineOf>[0],
          160,
        ),
        tags: [...(p.r.tags ?? [])],
        why: 'text',
        score: p.score,
      }));

      return {
        hits,
        total: ranked.length,
        truncated: offset + hits.length < ranked.length,
      };
    },

    async get(project, ids, opts) {
      const scope = baseScope(opts.actor, opts.scope);
      const records: MemoryRecordView[] = [];
      const missing: string[] = [];
      for (const id of ids) {
        const found = await memory.reader.get(project, id);
        const tags = found?.tags ?? [];
        if (
          !found ||
          !scopeAdmits(scope, { kind: found.kind, status: found.status, tags })
        ) {
          missing.push(id);
          continue;
        }

        const truncated = opts.full !== true && found.body.length > BODY_CAP;
        records.push({
          id: found.id,
          kind: found.kind,
          status: found.status,
          statement: found.statement,
          body: truncated ? found.body.slice(0, BODY_CAP) : found.body,
          body_truncated: truncated,
          tags,
          source: found.source,
          author: found.author,
          origin: found.origin,
          confidence: found.confidence ?? null,
          pinned: found.pinned,
          valid_from: found.valid_from,
          valid_to: found.valid_to ?? null,
          supersedes: found.supersedes ?? null,
          superseded_by: found.superseded_by ?? null,
          gist: null,
          aliases: [],
          links: [],
          imported: null,
        });
      }

      return { records, missing };
    },

    async related() {
      return [];
    },

    async list(project): Promise<MemoryListEntry[]> {
      return [...(await memory.reader.list(project))];
    },

    async digest(project, scope): Promise<MemoryDigest> {
      const s = await slice(project, scope);
      const tally = new Map<string, number>();
      for (const r of [...s.decisions, ...s.rejected]) {
        for (const t of r.tags ?? []) {
          tally.set(t, (tally.get(t) ?? 0) + 1);
        }
      }

      return {
        decisions: s.decisions.length,
        rejected: s.rejected.length,
        proposals: 0,
        pinned: 0,
        tags: [...tally]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count),
      };
    },

    async rejected(project, limit, scope) {
      const s = await slice(project, scope);

      return limit === undefined ? s.rejected : s.rejected.slice(0, limit);
    },

    async pinned() {
      return [];
    },

    async decisions(project, scope) {
      return (await slice(project, scope)).decisions;
    },

    async history() {
      return null;
    },
  };
}
