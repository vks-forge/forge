/**
 * Memory context — the decisions and rejected approaches a Director step puts in its prompt.
 *
 * Why: six Director steps (triage, planning, card chat, dispatch, the two escalation steps) used to paste a
 *   project's whole memory into every prompt, which grows without bound. This builds the same prompt shape
 *   from the memory index instead: pinned decisions plus the few most relevant to the question, with a note
 *   saying how many active decisions were left out, and every rejected approach (up to a cap, then the most
 *   relevant), because a rejected approach that is ranked away is a constraint the Director silently loses
 *   (d-0141 item 6, d-0168). A project small enough to fit is sent whole, exactly as before. Without an
 *   index (a project still read from its old repository, or a test) the old whole slice is used unchanged.
 *   An agent's memory slice (d-0078) is applied as the search scope, so a filter can only show less.
 *
 * Exports: buildMemoryContext(), questionOf().
 * Depends on: @forge/core (scopes, MemoryIndex port), tick/memory-rewrite, tick/planning-state,
 *   types/memory-context.
 */

import {
  BUILTIN_DIRECTOR_CONFIG,
  directorScope,
  extractTerms,
  workerScope,
} from '@forge/core';
import type { MemoryRecordRef, MemoryScope } from '@forge/core';
import { rewriteQuestion } from '#/tick/memory-rewrite.js';
import { directorFor } from '#/tick/planning-state.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type {
  MemoryContext,
  MemoryContextOptions,
  MemoryRewrite,
} from '#/types/memory-context.types.js';

const TERM_CAP = 6;
const byIdAscending = (a: MemoryRecordRef, b: MemoryRecordRef): number =>
  a.id < b.id ? -1 : 1;

/** The text a ticket's key words come from: its title and body. */
export const questionOf = (title: string, body: string): string => `${title}\n${body}`;

function searchQuery(project: string, words: MemoryRewrite, question: string) {
  const clean = (list: readonly string[]) =>
    list.filter((w) => w.length >= 1 && w.length <= 40);

  return {
    project,
    actor: 'director' as const,
    ...(words.terms.length > 0
      ? {
          terms: clean(words.terms).slice(0, TERM_CAP),
          synonyms: clean(words.synonyms).slice(0, 8),
        }
      : { text: question.slice(0, 10_000) }),
    ...(words.tags.length > 0 ? { tag_hints: words.tags.slice(0, 4) } : {}),
  };
}

/** Every rejected approach when they fit; past the cap the most relevant first, then the newest, never more than the cap. */
async function rejectedFor(
  ctx: EngineCtx,
  project: string,
  scope: MemoryScope,
  max: number,
  words: () => Promise<MemoryRewrite>,
  question: string,
): Promise<{ list: readonly MemoryRecordRef[]; total: number }> {
  const index = ctx.deps.memoryIndex;
  const all = (await index?.rejected(project, undefined, scope)) ?? [];
  if (all.length <= max) {
    return { list: all, total: all.length };
  }

  const reply = await index?.search({
    ...searchQuery(project, await words(), question),
    kinds: ['rejected'],
    k: Math.min(max, 25),
    scope,
  });

  const ranked = new Set((reply?.hits ?? []).map((h) => h.id));
  const first = all.filter((r) => ranked.has(r.id));
  const rest = all.filter((r) => !ranked.has(r.id));

  return { list: [...first, ...rest].slice(0, max), total: all.length };
}

/**
 * The memory a step shows the Director for `project`. Never throws for a missing index; a step that
 * asked for a rewrite still runs when the rewrite fails (see `rewriteQuestion`).
 */
export async function buildMemoryContext(
  ctx: EngineCtx,
  project: string,
  opts: MemoryContextOptions,
): Promise<MemoryContext> {
  const index = ctx.deps.memoryIndex;
  if (!index) {
    return opts.filter
      ? ctx.deps.memory.slice(project, opts.filter)
      : ctx.deps.memory.slice(project);
  }

  const settings =
    directorFor(ctx, project).director.memory ?? BUILTIN_DIRECTOR_CONFIG.memory;

  const scope = opts.filter ? workerScope(opts.filter) : directorScope();
  const everything = await index.decisions(project, scope);
  const small = everything.length <= settings.pinned_max + settings.top_k;

  // The words are worked out at most once, and only when something has to be left out.
  let words: Promise<MemoryRewrite> | undefined;
  const wordsOf = (): Promise<MemoryRewrite> => {
    words ??= (async () => {
      if (opts.rewrite && settings.rewrite) {
        const digest = await index.digest(project, scope);

        return rewriteQuestion(
          ctx,
          project,
          opts.question,
          settings,
          digest.tags,
          opts.cardId,
        );
      }

      return {
        terms: extractTerms(opts.question),
        synonyms: [],
        tags: [],
        source: 'fallback' as const,
      };
    })();

    return words;
  };

  const rejected =
    opts.filter && !opts.filter.include_rejected
      ? { list: [] as readonly MemoryRecordRef[], total: 0 }
      : await rejectedFor(
          ctx,
          project,
          scope,
          settings.rejected_max,
          wordsOf,
          opts.question,
        );

  const cutRejected = rejected.total > rejected.list.length;
  if (small) {
    return {
      decisions: [...everything].sort(byIdAscending),
      rejected: rejected.list,
      ...(cutRejected
        ? { note: rejectedNote(rejected.list.length, rejected.total) }
        : {}),
    };
  }

  const pinned = await index.pinned(project, settings.pinned_max, scope);
  const reply = await index.search({
    ...searchQuery(project, await wordsOf(), opts.question),
    kinds: ['decision'],
    k: settings.top_k,
    scope,
  });

  const byId = new Map(everything.map((r) => [r.id, r]));
  const shown = new Map<string, MemoryRecordRef>();
  for (const r of pinned) {
    shown.set(r.id, byId.get(r.id) ?? r);
  }

  for (const hit of reply.hits) {
    const full = byId.get(hit.id);
    if (full) {
      shown.set(hit.id, full);
    }
  }

  const note =
    `Showing ${shown.size} of ${everything.length} active decisions: pinned and most relevant; ` +
    (cutRejected
      ? rejectedNote(rejected.list.length, rejected.total).replace(
          /^Showing /,
          'showing ',
        )
      : 'all rejected approaches are listed');

  return { decisions: [...shown.values()], rejected: rejected.list, note };
}

const rejectedNote = (shown: number, total: number): string =>
  `Showing ${shown} of ${total} rejected approaches: the most relevant first`;
