/**
 * Pins the memory rewrite step: one cheap model call that turns a question into key words, and never blocks a step.
 *
 * Why: a question in plain language can miss the words a decision was written with, so for card planning and
 *   card chat the Director asks a small model for terms and synonyms. That call costs real money and can be
 *   slow or wrong, so it runs only on a large memory, with its own timeout and budget, is cached per question,
 *   is validated (a tag outside the project's vocabulary is dropped) and falls back to plain keywords on any
 *   failure: the step being served always runs.
 *
 * Pins: terms and synonyms reach the search, unknown tags dropped, the call is recorded as a step with the
 *   settings budget and timeout, timeout / invalid output / budget stop fall back to keywords and the context is
 *   still built, a cache hit makes no second call, `rewrite: false` and a small memory make none, spend
 *   lands in the card director spend and warns at 80 percent of the Forge default on a card with no cap,
 *   a trace entry names the source.
 * Depends on: helpers/memory-ctx, helpers/planning-rig, src/tick/memory-context, vitest.
 */

import { describe, expect, it } from 'vitest';
import { fail } from '#tests/helpers/scripted-llm.js';
import { manyRecords, memoryCtx } from '#tests/helpers/memory-ctx.js';
import { createPlanCard, planningRig } from '#tests/helpers/planning-rig.js';
import { buildMemoryContext } from '#/tick/memory-context.js';

const big = () => manyRecords(150, 3, 0);
const Q = 'how do we keep topic9 safe';

describe('memory rewrite', () => {
  it('searches with the terms and synonyms the model gave and drops tags outside the vocabulary', async () => {
    const { ctx, llm, index } = memoryCtx(big());
    index.tags = [{ tag: 'even', count: 75 }];
    llm.script('memory_rewrite', {
      terms: ['topic9'],
      synonyms: ['topic10'],
      tags: ['even', 'invented'],
    });

    const out = await buildMemoryContext(ctx, 'forge', { question: Q, rewrite: true });

    const call = llm.callsTo('memory_rewrite')[0];
    expect(call?.input).toEqual({
      question: Q,
      known_tags: [{ tag: 'even', count: 75 }],
    });

    expect(call?.opts).toMatchObject({
      model: 'haiku',
      budgetUsd: 0.25,
      timeoutMs: 15_000,
    });

    expect(index.searches[0]).toMatchObject({
      terms: ['topic9'],
      synonyms: ['topic10'],
      tag_hints: ['even'],
    });

    expect(out.decisions.map((d) => d.id)).toEqual(
      expect.arrayContaining(['d-0009', 'd-0010']),
    );
  });

  it('falls back to plain keywords when the model answers off-schema, runs out of budget or errors', async () => {
    for (const answer of [
      { nonsense: true },
      fail({ kind: 'budget', message: 'stopped' }),
      fail({ kind: 'crash', message: 'boom' }),
    ]) {
      const { ctx, llm, index } = memoryCtx(big());
      llm.script('memory_rewrite', answer);

      const out = await buildMemoryContext(ctx, 'forge', {
        question: 'topic9',
        rewrite: true,
      });

      expect(index.searches[0]?.terms).toEqual(['topic9']);
      expect(out.decisions.map((d) => d.id)).toContain('d-0009');
      expect(out.rejected).toHaveLength(3);
    }
  });

  it('falls back when the call does not return within the timeout', async () => {
    const { ctx, llm, index } = memoryCtx(big(), { rewrite_timeout_ms: 1000 });
    llm.during('memory_rewrite', () => new Promise((r) => setTimeout(r, 2500)));
    const started = Date.now();

    const out = await buildMemoryContext(ctx, 'forge', {
      question: 'topic9',
      rewrite: true,
    });

    expect(Date.now() - started).toBeLessThan(2400);
    expect(index.searches[0]?.terms).toEqual(['topic9']);
    expect(out.decisions.map((d) => d.id)).toContain('d-0009');
  }, 10_000);

  it('makes one call per question and none when the cache holds it', async () => {
    const { ctx, llm } = memoryCtx(big());
    llm.script('memory_rewrite', { terms: ['topic9'], synonyms: [], tags: [] });

    await buildMemoryContext(ctx, 'forge', { question: Q, rewrite: true });
    await buildMemoryContext(ctx, 'forge', { question: Q, rewrite: true });
    await buildMemoryContext(ctx, 'other', { question: Q, rewrite: true });

    expect(llm.callsTo('memory_rewrite')).toHaveLength(2);
  });

  it('makes no call when the setting is off, the caller does not ask or the memory is small', async () => {
    const off = memoryCtx(big(), { rewrite: false });
    await buildMemoryContext(off.ctx, 'forge', { question: Q, rewrite: true });

    const unasked = memoryCtx(big());
    await buildMemoryContext(unasked.ctx, 'forge', { question: Q, rewrite: false });

    const small = memoryCtx(manyRecords(10, 1));
    await buildMemoryContext(small.ctx, 'forge', { question: Q, rewrite: true });

    expect(off.llm.callsTo('memory_rewrite')).toEqual([]);
    expect(unasked.llm.callsTo('memory_rewrite')).toEqual([]);
    expect(small.llm.callsTo('memory_rewrite')).toEqual([]);
  });

  it('adds the call cost to the card director spend', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    const { ctx, llm } = memoryCtx(big());
    llm.script('memory_rewrite', { terms: ['topic9'], synonyms: [], tags: [] });
    llm.cost('memory_rewrite', 0.12);
    const withStorage = { ...ctx, deps: { ...ctx.deps, storage: rig.storage } };

    await buildMemoryContext(withStorage as never, 'forge', {
      question: Q,
      rewrite: true,
      cardId: id,
    });

    const grill = (await rig.storage.transaction((tx) => tx.cardPlanning.get(id))).grill;
    expect(grill.director_spend_usd).toBeCloseTo(0.12, 10);
  });

  it('warns at 80 percent of the Forge default when its cost lifts a card with no cap there', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    const { ctx, llm } = memoryCtx(big());
    llm.script('memory_rewrite', { terms: ['topic9'], synonyms: [], tags: [] });
    llm.cost('memory_rewrite', 4.4);
    const withStorage = { ...ctx, deps: { ...ctx.deps, storage: rig.storage } };

    await buildMemoryContext(withStorage as never, 'forge', {
      question: Q,
      rewrite: true,
      cardId: id,
    });

    const warned = (
      await rig.storage.transaction((tx) => tx.cardEvents.list(id, { limit: 500 }))
    )
      .filter((e) => e.kind === 'budget_warning')
      .map((e) => (e.payload as { threshold: number }).threshold);

    expect(warned).toEqual([0.8]);
  });

  it('leaves a trace entry that says where the terms came from', async () => {
    const { ctx, llm, traces } = memoryCtx(big());
    llm.script('memory_rewrite', { terms: ['topic9'], synonyms: [], tags: [] });

    await buildMemoryContext(ctx, 'forge', { question: Q, rewrite: true });
    await buildMemoryContext(ctx, 'forge', { question: Q, rewrite: true });

    const kinds = traces.map((t) => (t.data as { source: string }).source);
    expect(kinds).toEqual(['model', 'cache']);
    expect(traces[0]?.message).toContain('memory_retrieval');
  });
});
