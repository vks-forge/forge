/**
 * Memory rewrite — one cheap model call that turns a question into key words and synonyms for the memory search.
 *
 * Why: a question in plain language ("how do we keep the build quick?") can miss the words a decision was
 *   written with ("CI", "pipeline", "cache"). For card planning and card chat the Director asks a small model
 *   for terms and synonyms, once per question. That call costs real money and may be slow, wrong or refused,
 *   so it has its own timeout and budget, is cached in this process per (project, question), is checked
 *   (a tag outside the project's own vocabulary is dropped) and falls back to plain keywords on any failure.
 *   It never throws and never blocks the step being served (d-0168, r-0003: one finite, schema-checked step).
 *   Its cost counts toward the card's Director spend like any other step (d-0143).
 *
 * Exports: rewriteQuestion().
 * Depends on: @forge/core (extractTerms, MemoryRewriteOutput), shared/trace, steps/run-step, tick/card-budget,
 *   types/memory-context, node:crypto.
 */

import { createHash } from 'node:crypto';
import { MemoryRewriteOutput, extractTerms } from '@forge/core';
import type { CardId, DirectorMemorySettings, MemoryDigest } from '@forge/core';
import { emitTrace } from '#/shared/trace.js';
import { runStep } from '#/steps/run-step.js';
import { addDirectorSpend } from '#/tick/card-budget.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { MemoryRewrite } from '#/types/memory-context.types.js';

/** Answers kept per engine, so a restart of the process is the only thing that forgets them. */
const caches = new WeakMap<object, Map<string, MemoryRewrite>>();
const QUESTION_MAX = 1000;

const cacheOf = (ctx: EngineCtx): Map<string, MemoryRewrite> => {
  let cache = caches.get(ctx.deps);
  if (!cache) {
    cache = new Map();
    caches.set(ctx.deps, cache);
  }

  return cache;
};

const plain = (question: string): MemoryRewrite => ({
  terms: extractTerms(question),
  synonyms: [],
  tags: [],
  source: 'fallback',
});

/** Resolves to `undefined` after `ms`, so a slow model call is abandoned rather than awaited. */
function timeout(ms: number): { promise: Promise<undefined>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });

  return { promise, cancel: () => clearTimeout(timer) };
}

/** The key words for `question`: from the cache, from one model call, or from plain keywords. Never throws. */
export async function rewriteQuestion(
  ctx: EngineCtx,
  project: string,
  question: string,
  settings: DirectorMemorySettings,
  tags: MemoryDigest['tags'],
  cardId?: CardId,
): Promise<MemoryRewrite> {
  const text = question.slice(0, QUESTION_MAX);
  const key = `${project}\u0000${createHash('sha256').update(text).digest('hex')}`;
  const cache = cacheOf(ctx);
  const hit = cache.get(key);
  const trace = (r: MemoryRewrite, reason?: string): MemoryRewrite => {
    emitTrace(ctx.deps, {
      level: 'info',
      kind: 'engine',
      project,
      ...(cardId === undefined ? {} : { card_id: cardId }),
      step: 'memory_rewrite',
      actor: 'engine',
      message: `memory_retrieval via ${r.source}`,
      data: {
        source: r.source,
        terms: r.terms,
        synonyms: r.synonyms,
        tags: r.tags,
        reason,
      },
    });

    return r;
  };

  if (hit) {
    return trace({ ...hit, source: 'cache' });
  }

  if (settings.rewrite_budget_usd <= 0) {
    return trace(plain(text), 'budget is zero');
  }

  let cost = 0;
  const known = tags.slice(0, 40).map((t) => ({ tag: t.tag, count: t.count }));
  const limit = timeout(settings.rewrite_timeout_ms);

  try {
    const call = runStep(
      ctx,
      'memory_rewrite',
      { question: text, known_tags: known },
      MemoryRewriteOutput,
      {
        budgetUsd: settings.rewrite_budget_usd,
        timeoutMs: settings.rewrite_timeout_ms,
        onCost: (usd) => {
          cost += usd;
        },
      },
    );

    // A call that outlives the timeout is left to finish on its own; its answer is ignored.
    call.catch(() => undefined);
    const result = await Promise.race([call, limit.promise]);
    limit.cancel();
    await spend(ctx, cardId, cost);

    if (result === undefined) {
      return trace(plain(text), 'timeout');
    }

    if (!result.ok) {
      return trace(plain(text), `${result.error.kind}: ${result.error.message}`);
    }

    const vocabulary = new Set(known.map((t) => t.tag));
    const rewritten: MemoryRewrite = {
      terms: result.value.terms,
      synonyms: result.value.synonyms,
      tags: result.value.tags.filter((t) => vocabulary.has(t)),
      source: 'model',
    };

    cache.set(key, rewritten);

    return trace(rewritten);
  } catch (error) {
    limit.cancel();

    return trace(plain(text), error instanceof Error ? error.message : String(error));
  }
}

/** Counts the call's dollars on the card; a failure to record never fails the step. */
async function spend(
  ctx: EngineCtx,
  cardId: CardId | undefined,
  usd: number,
): Promise<void> {
  if (cardId === undefined || usd <= 0) {
    return;
  }

  try {
    await ctx.deps.storage.transaction((tx) =>
      addDirectorSpend(tx, cardId, usd, ctx.nowIso),
    );
  } catch (error) {
    ctx.deps.log?.('warn', 'memory rewrite spend could not be recorded', {
      card: cardId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
