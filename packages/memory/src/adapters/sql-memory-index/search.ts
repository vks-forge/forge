/**
 * The memory search pipeline: scope, terms, ranked lists, fusion, boosts, successors and the size cap.
 *
 * Why: finding the right decisions in a growing memory must be relevant and safe at once. The question is
 *   cut to key words (or arrives as terms and synonyms from a rewrite), matched first as "all words" and,
 *   only when fewer than three records match, as "any word"; tags the rewrite found and one hop of links from
 *   the best matches add lists of their own. Reciprocal rank fusion merges the lists, small boosts put pinned
 *   decisions first, and a hit on a superseded decision is replaced by the decision that replaced it. The
 *   scope is applied inside every query and again to every candidate, so nothing a caller may not see can come
 *   back from any list. The answer is cut to the caller's `k` and to 2,500 characters and says how many
 *   matched in all (d-0168).
 *
 * Exports: runSearch(), SEARCH_CHAR_CAP, LEXICAL_LIMIT.
 * Depends on: @forge/core, adapters/sql-memory-index/{scopes,views}, types/sql-index.
 */

import { boost, buildMatch, extractTerms, rrf, scopeAdmits, wordsOf } from '@forge/core';
import type {
  MemoryHit,
  MemoryRow,
  MemoryScope,
  MemorySearchQuery,
  MemorySearchReply,
  StorageTx,
} from '@forge/core';
import {
  baseScope,
  narrowedNote,
  searchScope,
  widenForSuccessors,
} from '#/adapters/sql-memory-index/scopes.js';
import { fitJson, lineOf, snippetFrom } from '#/adapters/sql-memory-index/views.js';
import type { Candidate } from '#/types/sql-index.types.js';

export const SEARCH_CHAR_CAP = 2500;
export const LEXICAL_LIMIT = 30;
const LINK_SEEDS = 3;
const SUCCESSOR_HOPS = 5;
const MS_PER_DAY = 86_400_000;

const stem = (w: string): string => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

/** Which part of the record matched, as far as plain word overlap can tell. */
function whyOf(
  c: Candidate,
  words: readonly string[],
  lexical: boolean,
  tagged: boolean,
): MemoryHit['why'] {
  if (lexical) {
    const has = (text: readonly string[]): boolean =>
      text.some((t) => words.some((w) => stem(t) === stem(w) || t.startsWith(w)));

    if (has(wordsOf(c.row.statement))) {
      return 'statement';
    }

    if (
      has([...wordsOf(c.row.gist ?? ''), ...c.row.aliases.flatMap((a) => wordsOf(a))])
    ) {
      return 'gist';
    }

    if (has(c.tags.flatMap((t) => wordsOf(t)))) {
      return 'tag';
    }

    return 'text';
  }

  return tagged ? 'tag' : 'link';
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

/** The active record that replaced `row`, following the chain, or null when none is visible to the caller. */
async function successorOf(
  tx: StorageTx,
  scope: MemoryScope,
  row: MemoryRow,
): Promise<Candidate | null> {
  let current = row;
  for (let hop = 0; hop < SUCCESSOR_HOPS && current.superseded_by !== null; hop += 1) {
    const next = await tx.memory.get(current.project, current.superseded_by);
    if (next === null) {
      return null;
    }

    const tags = (await tx.memory.tagsOf(next.project, [next.id]))[next.id] ?? [];
    if (scopeAdmits(scope, { kind: next.kind, status: next.status, tags })) {
      return { row: next, tags };
    }

    current = next;
  }

  return null;
}

export async function runSearch(
  tx: StorageTx,
  now: Date,
  q: MemorySearchQuery,
): Promise<
  MemorySearchReply & { terms: string[]; scope: MemoryScope; k: number; offset: number }
> {
  const k = Math.min(25, Math.max(1, q.k ?? 8));
  const offset = Math.max(0, q.offset ?? 0);
  const base = baseScope(q.actor, q.scope);
  const filters = { kinds: q.kinds, status: q.status, tags: q.tags };
  const scope = searchScope(base, filters);
  const note = narrowedNote(base, filters);
  const lexical = widenForSuccessors(scope);

  const terms =
    q.terms !== undefined && q.terms.length > 0 ? q.terms : extractTerms(q.text ?? '');

  const synonyms = q.synonyms ?? [];
  const wantSnippet = q.actor === 'web';
  const andMatch = buildMatch({ terms, mode: 'and', prefix: true });
  const orMatch = buildMatch({ terms, synonyms, mode: 'or', prefix: true });

  const run = (match: string | null) =>
    match === null
      ? Promise.resolve([])
      : tx.memory.searchLexical({
          project: q.project,
          match,
          scope: lexical,
          limit: LEXICAL_LIMIT,
          snippet: wantSnippet,
        });

  const all = await run(andMatch);
  const any = all.length < 3 ? await run(orMatch) : [];
  const snippets = new Map([...any, ...all].map((h) => [h.id, h.snippet]));
  const lexIds = [...new Set([...all, ...any].map((h) => h.id))];

  let tagIds: string[] = [];
  if (q.tag_hints !== undefined && q.tag_hints.length > 0) {
    const rows = await tx.memory.list(q.project, {
      tags: q.tag_hints,
      kinds: lexical.kinds,
      statuses: lexical.status,
      order: 'newest',
      limit: LEXICAL_LIMIT,
    });

    tagIds = rows.map((r) => r.id);
  }

  const linkIds: string[] = [];
  for (const id of lexIds.slice(0, LINK_SEEDS)) {
    const links = await tx.memory.linksOf(q.project, id);
    for (const l of links.out) {
      if (l.target_kind === 'record') {
        linkIds.push(l.target);
      }
    }

    for (const l of links.in) {
      linkIds.push(l.from_id);
    }
  }

  const fused = rrf([all.map((h) => h.id), any.map((h) => h.id), tagIds, linkIds]);
  const candidates = await load(
    tx,
    q.project,
    fused.map((f) => f.id),
  );

  const lexSet = new Set(lexIds);
  const tagSet = new Set(tagIds);
  const words = [...terms, ...synonyms].flatMap((t) => wordsOf(t));
  const hits: MemoryHit[] = [];
  const seen = new Set<string>();

  const ranked = fused
    .flatMap((f) => {
      const c = candidates.get(f.id);

      return c === undefined ||
        !scopeAdmits(lexical, { kind: c.row.kind, status: c.row.status, tags: c.tags })
        ? []
        : [
            {
              c,
              score: boost(f.score, {
                pinned: c.row.pinned,
                status: c.row.status,
                kind: c.row.kind,
                ageDays: (now.getTime() - Date.parse(c.row.created_at)) / MS_PER_DAY,
              }),
            },
          ];
    })
    .sort((a, b) => b.score - a.score || (a.c.row.id < b.c.row.id ? -1 : 1));

  for (const { c, score } of ranked) {
    let shown = c;
    let replacedBy: string | undefined;
    if (!scopeAdmits(scope, { kind: c.row.kind, status: c.row.status, tags: c.tags })) {
      const next = await successorOf(tx, scope, c.row);
      if (next === null) {
        continue;
      }

      shown = next;
      replacedBy = c.row.id;
    }

    if (seen.has(shown.row.id)) {
      continue;
    }

    seen.add(shown.row.id);
    const snippet =
      replacedBy === undefined
        ? snippetFrom(snippets.get(shown.row.id) ?? null)
        : undefined;

    hits.push({
      id: shown.row.id,
      kind: shown.row.kind,
      status: shown.row.status,
      line: lineOf(shown.row, 160),
      tags: [...shown.tags],
      why: whyOf(shown, words, lexSet.has(c.row.id), tagSet.has(c.row.id)),
      score,
      ...(snippet === undefined ? {} : { snippet }),
      ...(replacedBy === undefined ? {} : { replaced_by: replacedBy }),
    });
  }

  const page = hits.slice(offset, offset + k);
  const sized = fitJson(
    page.map(({ id, kind, status, line, tags, why }) => ({
      id,
      kind,
      status,
      line,
      tags,
      why,
    })),
    SEARCH_CHAR_CAP,
  );

  const shownHits = page.slice(0, sized.fit.length);

  return {
    hits: shownHits,
    total: hits.length,
    truncated: offset + shownHits.length < hits.length,
    ...(note === undefined ? {} : { narrowed_note: note }),
    terms: [...terms, ...synonyms],
    scope,
    k,
    offset,
  };
}
