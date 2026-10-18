/**
 * Pins the Worker tool `memory_related` through the MCP protocol: neighbours of a visible record, nothing else.
 *
 * Why: after reading a decision a Worker may ask what is linked to it (amends, supersedes, shared tags,
 *   similar text). The question is only answered for a record the Worker may already see: an unknown record
 *   and one outside its scope get the same typed `not_found`. The index filters every neighbour by the same
 *   scope, so a link into a pending proposal is dropped, not shown. The answer is capped at 1,200
 *   characters, opens with the notice that it is recorded data, and the call leaves the run and ticket for
 *   the access log (d-0067, d-0168).
 *
 * Pins: memory_related.
 * Depends on: helpers/harness, helpers/fake-memory, helpers/auto-close, @forge/core.
 */

import { MEMORY_NOTICE, workerScope } from '@forge/core';
import type { MemoryRelated } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { fakeMemory, workerMemory } from '#tests/helpers/fake-memory.js';
import type { FakeRecord } from '#tests/helpers/fake-memory.js';
import { connect, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

const RECORDS: FakeRecord[] = [
  {
    project: 'forge',
    id: 'd-0001',
    kind: 'decision',
    status: 'active',
    statement: 'Use postgres',
  },
  {
    project: 'forge',
    id: 'x-0001',
    kind: 'proposal',
    status: 'pending',
    statement: 'Use sqlite',
  },
  {
    project: 'other',
    id: 'd-0009',
    kind: 'decision',
    status: 'active',
    statement: 'Elsewhere',
  },
];

const near = (id: string, line = 'Use REST for the api'): MemoryRelated => ({
  id,
  kind: 'decision',
  status: 'active',
  line,
  reasons: ['amends', 'shares tags: api, db', 'similar text'],
});

async function related(
  args: Record<string, unknown>,
  neighbours: MemoryRelated[] = [near('d-0002')],
) {
  const fake = fakeMemory(RECORDS, neighbours);
  const scope = workerScope({ tags: [], include_rejected: false });
  const { client, close } = await connect({ ...workerMemory(fake, scope) });
  closer.set(close);
  const result = await client.callTool({ name: 'memory_related', arguments: args });

  return { fake, result, text: textOf(result) };
}

describe('memory_related', () => {
  it('returns the neighbours under the notice', async () => {
    const { text, result } = await related({ id: 'd-0001' });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text)).toEqual({
      notice: MEMORY_NOTICE,
      related: [near('d-0002')],
    });
  });

  it.each([
    ['a pending proposal', 'x-0001'],
    ['another project record', 'd-0009'],
    ['an unknown record', 'd-4040'],
  ])('answers %s with the same not_found', async (_label, id) => {
    const { result, text } = await related({ id });

    expect(result.isError).toBe(true);
    expect(text).toBe(`not_found: no memory record ${id} visible to this run`);
  });

  it('asks for five neighbours by default, at most five, and passes scope, actor, run and ticket', async () => {
    const { fake } = await related({ id: 'd-0001' });
    const wide = await related({ id: 'd-0001', k: 6 });

    expect(fake.relateds).toEqual([
      {
        id: 'd-0001',
        k: 5,
        opts: {
          actor: 'worker',
          scope: workerScope({ tags: [], include_rejected: false }),
          run_id: 'run-1',
          ticket_id: 'SF-1',
        },
      },
    ]);

    expect(wide.result.isError).toBe(true);
    expect(wide.fake.relateds).toEqual([]);
  });

  it('cuts the answer to 1,200 characters', async () => {
    const many = ['d-0002', 'd-0003', 'd-0004', 'd-0005', 'd-0006'].map((id) =>
      near(id, 'x'.repeat(139)),
    );

    const { text } = await related({ id: 'd-0001' }, many);
    const out = JSON.parse(text) as { related: unknown[] };

    expect(text.length).toBeLessThanOrEqual(1_200);
    expect(out.related.length).toBeGreaterThan(0);
    expect(out.related.length).toBeLessThan(5);
  });

  it('refuses widening fields and says not_found or invalid_input when memory is not usable', async () => {
    const widen = await related({ id: 'd-0001', project: 'other' });
    const fake = fakeMemory(RECORDS);
    const placed = await connect({ memory: fake.index, memoryScope: async () => null });
    closer.set(placed.close);
    const none = await placed.client.callTool({
      name: 'memory_related',
      arguments: { id: 'd-0001' },
    });

    const off = await connect();
    closer.set(off.close);
    const unset = await off.client.callTool({
      name: 'memory_related',
      arguments: { id: 'd-0001' },
    });

    expect(widen.fake.relateds.every((r) => r.id === 'd-0001')).toBe(true);
    expect(textOf(none)).toMatch(/^not_found:/);
    expect(textOf(unset)).toMatch(/^invalid_input:/);
  });
});
