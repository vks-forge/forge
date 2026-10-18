/**
 * Pins what the Director puts in a prompt from a project memory: pinned and relevant decisions, every rejected approach.
 *
 * Why: pasting the whole memory into every prompt does not scale, but dropping a record the owner decided
 *   or an approach the owner rejected would let the Director plan against them. The context therefore keeps
 *   pinned decisions and the few most relevant to the question, says how many it left out, and always lists
 *   every rejected approach (up to a cap, then ranked). A small project is sent whole, and a project
 *   without the index (a file-backed one) gets the old full slice unchanged.
 *
 * Pins: 150 decisions give pinned plus top-k plus all rejected and the "Showing N of M" note, small projects
 *   are whole with no note, the agent filter narrows decisions and can hide rejected, rejected past the cap
 *   are ranked and capped, no index keeps the old slice and shape.
 * Depends on: helpers/memory-ctx, src/tick/memory-context, vitest.
 */

import { describe, expect, it } from 'vitest';
import { manyRecords, memoryCtx } from '#tests/helpers/memory-ctx.js';
import { buildMemoryContext } from '#/tick/memory-context.js';

const ids = (xs: readonly { id: string }[]): string[] => xs.map((x) => x.id);

describe('buildMemoryContext', () => {
  it('gives pinned plus top-k decisions, every rejected approach and a note for 150 decisions', async () => {
    const { ctx, index } = memoryCtx(manyRecords(150, 5, 3));

    const out = await buildMemoryContext(ctx, 'forge', {
      question: 'topic77 topic120',
      rewrite: false,
    });

    const got = ids(out.decisions);
    expect(got).toEqual(expect.arrayContaining(['d-0001', 'd-0002', 'd-0003']));
    expect(got).toEqual(expect.arrayContaining(['d-0077', 'd-0120']));
    expect(got.length).toBeLessThanOrEqual(12 + 8);
    expect(got.length).toBeLessThan(150);
    expect(ids(out.rejected)).toHaveLength(5);
    expect(out.note).toBe(
      `Showing ${got.length} of 150 active decisions: pinned and most relevant; all rejected approaches are listed`,
    );

    expect(out.decisions[0]).toMatchObject({
      statement: expect.stringContaining('Decision'),
    });

    expect(index.searches[0]).toMatchObject({
      actor: 'director',
      project: 'forge',
      k: 8,
    });
  });

  it('sends a small project whole, with no note and no search', async () => {
    const { ctx, index } = memoryCtx(manyRecords(15, 2, 1));

    const out = await buildMemoryContext(ctx, 'forge', {
      question: 'anything',
      rewrite: false,
    });

    expect(out.decisions).toHaveLength(15);
    expect(out.rejected).toHaveLength(2);
    expect(out.note).toBeUndefined();
    expect(index.searches).toEqual([]);
  });

  it('narrows decisions to the agent tags and hides rejected approaches when asked', async () => {
    const { ctx } = memoryCtx(manyRecords(150, 4, 0));

    const out = await buildMemoryContext(ctx, 'forge', {
      question: 'topic2 topic3 topic4',
      rewrite: false,
      filter: { tags: ['even'], include_rejected: false },
    });

    const tags = out.decisions.map((d) => d.tags?.[0]);
    expect(tags.every((t) => t === 'even')).toBe(true);
    expect(out.decisions.length).toBeGreaterThan(0);
    expect(out.rejected).toEqual([]);
  });

  it('keeps tag-filtered rejected approaches complete', async () => {
    const { ctx } = memoryCtx(manyRecords(150, 6, 0));

    const out = await buildMemoryContext(ctx, 'forge', {
      question: 'x',
      rewrite: false,
      filter: { tags: ['odd'], include_rejected: true },
    });

    expect(ids(out.rejected).sort()).toEqual(['r-0001', 'r-0003', 'r-0005']);
  });

  it('lists rejected approaches past the cap ranked first, then newest, never more than the cap', async () => {
    const { ctx, index } = memoryCtx(manyRecords(150, 40, 0), { rejected_max: 10 });

    const out = await buildMemoryContext(ctx, 'forge', {
      question: 'reject3',
      rewrite: false,
    });

    expect(out.rejected).toHaveLength(10);
    expect(ids(out.rejected)).toContain('r-0003');
    expect(index.rejectedCalls.length).toBeGreaterThan(0);
  });

  it('reads the old whole slice when there is no index', async () => {
    const { ctx } = memoryCtx(manyRecords(150, 2));
    const slices: unknown[] = [];
    const bare = {
      ...ctx,
      deps: {
        ...ctx.deps,
        memoryIndex: undefined,
        memory: {
          slice: async (slug: string, filter?: unknown) => {
            slices.push([slug, filter]);

            return { decisions: [{ id: 'd-0001', statement: 's' }], rejected: [] };
          },
        },
      },
    };

    const out = await buildMemoryContext(bare as never, 'forge', {
      question: 'q',
      rewrite: true,
      filter: { tags: ['a'], include_rejected: true },
    });

    expect(out).toEqual({ decisions: [{ id: 'd-0001', statement: 's' }], rejected: [] });
    expect(slices).toEqual([['forge', { tags: ['a'], include_rejected: true }]]);
  });
});
