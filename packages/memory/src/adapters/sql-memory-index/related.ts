/**
 * Related records — the neighbours of one record: linked, sharing rare tags, or saying similar things.
 *
 * Why: after finding a decision a Worker or the owner wants the ones around it: what it amends, what replaced
 *   it, what cites it, what shares its card, what is tagged alike, what reads alike. Three lists are fused:
 *   edges in both directions in a fixed priority (supersedes, amends, reopens, cites, same card or ticket), tags
 *   weighed by how rare they are (a tag on most records says nothing), and the record's own most distinctive
 *   words as a text query. A neighbour that was superseded is shown with its successor so nobody follows a
 *   dead decision, and under a Worker's scope every entry is checked, so a link to something the Worker may not
 *   see is dropped. The answer is at most five entries, three reasons each and 1,200 characters.
 *
 * Exports: runRelated(), similarText(), RELATED_CHAR_CAP.
 * Depends on: @forge/core, adapters/sql-memory-index/{scopes,views}, types/sql-index.
 */

import {
  distinctiveTerms,
  buildMatch,
  rrf,
  scopeAdmits,
  tagWeights,
  termFrequencies,
  wordsOf,
} from '@forge/core';
import type {
  MemoryLinkRow,
  MemoryRelated,
  MemoryRow,
  MemoryScope,
  StorageTx,
} from '@forge/core';
import { searchScope } from '#/adapters/sql-memory-index/scopes.js';
import { cut, fitJson } from '#/adapters/sql-memory-index/views.js';
import type { Candidate } from '#/types/sql-index.types.js';

export const RELATED_CHAR_CAP = 1200;
const MAX_REASONS = 3;
const LINE_MAX = 140;

const OUTGOING = ['supersedes', 'amends', 'reopens', 'cites'] as const;
const INCOMING: Record<(typeof OUTGOING)[number], string> = {
  supersedes: 'superseded by',
  amends: 'amended by',
  reopens: 'reopened by',
  cites: 'cited by',
};

/** Edges around a record, in priority order, as `id` to the reasons they give. */
function linkReasons(
  row: Candidate['row'],
  out: readonly MemoryLinkRow[],
  incoming: readonly MemoryLinkRow[],
  shared: readonly { id: string; rel: 'card' | 'ticket' }[],
): Map<string, string[]> {
  const reasons = new Map<string, string[]>();
  const add = (id: string, reason: string): void => {
    const list = reasons.get(id) ?? [];
    if (id !== row.id && !list.includes(reason)) {
      reasons.set(id, [...list, reason]);
    }
  };

  for (const rel of OUTGOING) {
    out
      .filter((l) => l.rel === rel && l.target_kind === 'record')
      .forEach((l) => add(l.target, rel));

    incoming.filter((l) => l.rel === rel).forEach((l) => add(l.from_id, INCOMING[rel]));
    if (rel === 'supersedes' && row.superseded_by !== null) {
      add(row.superseded_by, 'superseded by');
    }
  }

  shared.forEach((s) => add(s.id, s.rel === 'card' ? 'same card' : 'same ticket'));

  return reasons;
}

async function load(
  tx: StorageTx,
  project: string,
  ids: readonly string[],
): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();
  if (ids.length === 0) {
    return out;
  }

  const rows = await tx.memory.list(project, { ids });
  const tags = await tx.memory.tagsOf(
    project,
    rows.map((r) => r.id),
  );

  for (const row of rows) {
    out.set(row.id, { row, tags: tags[row.id] ?? [] });
  }

  return out;
}

/** Strips a plural or past ending so `tests` and `testing` count as one word. */
const stem = (w: string): string => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

/**
 * Records in `scope` that share at least two of the record's most distinctive words (one when it has only
 * one), best match first. One shared common word is not similarity, so a single hit is never enough.
 */
export async function similarText(
  tx: StorageTx,
  project: string,
  row: MemoryRow,
  scope: MemoryScope,
  n: number,
): Promise<{ id: string }[]> {
  const tf = termFrequencies([row.statement, row.gist ?? '', ...row.aliases].join(' '));
  const df = await tx.memory.documentFrequency(project, [...tf.keys()]);
  const terms = distinctiveTerms(tf, df, n);
  const match = buildMatch({ terms, mode: 'or' });
  if (match === null) {
    return [];
  }

  const hits = (
    await tx.memory.searchLexical({ project, match, scope, limit: 12, snippet: false })
  ).filter((h) => h.id !== row.id);

  const found = await tx.memory.list(project, { ids: hits.map((h) => h.id) });
  const need = Math.min(2, terms.length);
  const wanted = new Set(terms.map(stem));

  return hits.filter((h) => {
    const other = found.find((r) => r.id === h.id);
    const words = new Set(
      wordsOf([other?.statement ?? '', other?.gist ?? ''].join(' ')).map(stem),
    );

    return [...wanted].filter((w) => words.has(w)).length >= need;
  });
}

/** Up to `k` neighbours of `id` inside `scope`; null when the record is unknown or out of scope. */
export async function runRelated(
  tx: StorageTx,
  project: string,
  id: string,
  k: number,
  scope: MemoryScope,
): Promise<MemoryRelated[] | null> {
  const row = await tx.memory.get(project, id);
  const own = row === null ? [] : ((await tx.memory.tagsOf(project, [id]))[id] ?? []);
  if (
    row === null ||
    !scopeAdmits(scope, { kind: row.kind, status: row.status, tags: own })
  ) {
    return null;
  }

  const links = await tx.memory.linksOf(project, id);
  const reasons = linkReasons(row, links.out, links.in, links.shared);
  const linkIds = [...reasons.keys()];

  const counts = (await tx.memory.counts(project)).filter(
    (c) => c.status === 'active' || c.status === 'rejected',
  );

  const n = counts.reduce((sum, c) => sum + c.count, 0);
  const weights = tagWeights(
    await tx.memory.tagStats(project, ['active', 'rejected']),
    n,
  );

  const shareable = own.filter((t) => weights.has(t));
  const tagged =
    shareable.length === 0
      ? []
      : await tx.memory.list(project, {
          tags: shareable,
          kinds: ['decision', 'rejected'],
          statuses: ['active', 'rejected'],
        });

  const tagTags = await tx.memory.tagsOf(
    project,
    tagged.map((r) => r.id),
  );

  const tagScores = tagged
    .filter((r) => r.id !== id)
    .map((r) => {
      const shared = (tagTags[r.id] ?? []).filter((t) => shareable.includes(t));

      return {
        id: r.id,
        shared: shared.sort((a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0)),
        score: shared.reduce((sum, t) => sum + (weights.get(t) ?? 0), 0),
      };
    })
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));

  const text = await similarText(tx, project, row, searchScope(scope, {}), n);

  const fused = rrf([linkIds, tagScores.map((t) => t.id), text.map((t) => t.id)]);
  const candidates = await load(
    tx,
    project,
    fused.map((f) => f.id),
  );

  const textSet = new Set(text.map((t) => t.id));
  const tagInfo = new Map(tagScores.map((t) => [t.id, t.shared]));
  const out: MemoryRelated[] = [];
  const have = new Set<string>();

  const push = (c: Candidate, why: string[], suffix = ''): void => {
    if (have.has(c.row.id) || why.length === 0) {
      return;
    }

    have.add(c.row.id);
    const base = (c.row.gist ?? c.row.statement).replace(/\s+/g, ' ').trim();
    out.push({
      id: c.row.id,
      kind: c.row.kind,
      status: c.row.status,
      line: `${cut(base, LINE_MAX - suffix.length)}${suffix}`,
      reasons: why.slice(0, MAX_REASONS),
    });
  };

  for (const f of fused) {
    const c = candidates.get(f.id);
    if (c === undefined) {
      continue;
    }

    const why = [
      ...(reasons.get(f.id) ?? []),
      ...(tagInfo.has(f.id)
        ? [`shares tags: ${(tagInfo.get(f.id) ?? []).slice(0, 3).join(', ')}`]
        : []),
      ...(textSet.has(f.id) ? ['similar text'] : []),
    ];

    const admitted = scopeAdmits(scope, {
      kind: c.row.kind,
      status: c.row.status,
      tags: c.tags,
    });

    const linked = reasons.has(f.id);
    if (c.row.status === 'superseded' && linked && c.row.superseded_by !== null) {
      const next = (await load(tx, project, [c.row.superseded_by])).get(
        c.row.superseded_by,
      );

      if (admitted) {
        push(c, why, ` (superseded by ${c.row.superseded_by})`);
      }

      if (
        next !== undefined &&
        scopeAdmits(scope, {
          kind: next.row.kind,
          status: next.row.status,
          tags: next.tags,
        })
      ) {
        push(next, why);
      }

      continue;
    }

    if (admitted) {
      push(c, why);
    }
  }

  return fitJson(out.slice(0, Math.min(5, k)), RELATED_CHAR_CAP).fit;
}
