/**
 * Pins the Worker tool `memory_search` through the MCP protocol: scope is forced by the server, never by the Worker.
 *
 * Why: a Worker reads the owner's decisions to avoid contradicting them, but project memory also holds
 *   pending proposals, session outcomes, superseded decisions and other projects' records that it must
 *   never see. The tool takes only keywords and narrowing filters, hands the server-built scope to the index
 *   untouched (a Worker input can only narrow it), leaves the run and ticket on the call so the access log
 *   says who looked, caps its answer so one search cannot flood the Worker's context, and says plainly
 *   (typed errors) when memory is not set up or the run is unknown. Every answer opens with the notice
 *   that the text is recorded data, not instructions (d-0067, d-0168).
 *
 * Pins: memory_search.
 * Depends on: helpers/harness, helpers/fake-memory, helpers/auto-close, domain/tools/all-tools, @forge/core.
 */

import { MEMORY_NOTICE, directorScope, workerScope } from '@forge/core';
import type { MemoryScope } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { FORGE_TOOLS } from '#/domain/tools/all-tools.js';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { fakeMemory, workerMemory } from '#tests/helpers/fake-memory.js';
import type { FakeRecord } from '#tests/helpers/fake-memory.js';
import { connect, run, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

const RECORDS: FakeRecord[] = [
  {
    project: 'forge',
    id: 'd-0001',
    kind: 'decision',
    status: 'active',
    statement: 'Use postgres for storage',
    tags: ['db'],
  },
  {
    project: 'forge',
    id: 'd-0002',
    kind: 'decision',
    status: 'active',
    statement: 'Use REST for storage api',
    tags: ['api'],
  },
  {
    project: 'forge',
    id: 'r-0001',
    kind: 'rejected',
    status: 'rejected',
    statement: 'Use mongodb for storage',
    tags: ['db'],
  },
  {
    project: 'forge',
    id: 'x-0001',
    kind: 'proposal',
    status: 'pending',
    statement: 'Use sqlite for storage',
    tags: ['db'],
  },
  {
    project: 'forge',
    id: 'o-0001',
    kind: 'outcome',
    status: 'active',
    statement: 'Session about storage',
  },
  {
    project: 'forge',
    id: 'd-0003',
    kind: 'decision',
    status: 'superseded',
    statement: 'Use mysql for storage',
    tags: ['db'],
  },
  {
    project: 'other',
    id: 'd-0001',
    kind: 'decision',
    status: 'active',
    statement: 'Use postgres for storage elsewhere',
  },
];

async function search(
  scope: MemoryScope,
  args: Record<string, unknown>,
  records = RECORDS,
) {
  const fake = fakeMemory(records);
  const { client, close } = await connect({ ...workerMemory(fake, scope) });
  closer.set(close);
  const result = await client.callTool({ name: 'memory_search', arguments: args });

  return { fake, result, text: textOf(result) };
}

const idsIn = (text: string): string[] =>
  (JSON.parse(text) as { hits: { id: string }[] }).hits.map((h) => h.id).sort();

describe('memory_search scope', () => {
  it('shows a Worker only active decisions of its own project, under the notice', async () => {
    const { text, result } = await search(
      workerScope({ tags: [], include_rejected: false }),
      {
        query: 'storage',
      },
    );

    expect(result.isError).toBeFalsy();
    expect((JSON.parse(text) as { notice: string }).notice).toBe(MEMORY_NOTICE);
    expect(idsIn(text)).toEqual(['d-0001', 'd-0002']);
  });

  it('adds rejected approaches only when the agent slice includes them', async () => {
    const withRejected = await search(workerScope({ tags: [], include_rejected: true }), {
      query: 'storage',
    });

    expect(idsIn(withRejected.text)).toEqual(['d-0001', 'd-0002', 'r-0001']);
    const hidden = await search(workerScope({ tags: [], include_rejected: false }), {
      query: 'storage',
      kinds: ['rejected'],
    });

    expect(idsIn(hidden.text)).toEqual([]);
  });

  it('restricts to the agent tag slice, and a requested tag can only narrow it further', async () => {
    const slice = workerScope({ tags: ['db'], include_rejected: true });

    expect(idsIn((await search(slice, { query: 'storage' })).text)).toEqual([
      'd-0001',
      'r-0001',
    ]);

    expect(
      idsIn((await search(slice, { query: 'storage', tags: ['api'] })).text),
    ).toEqual([]);

    const open = workerScope({ tags: [], include_rejected: false });

    expect(idsIn((await search(open, { query: 'storage', tags: ['api'] })).text)).toEqual(
      ['d-0002'],
    );
  });

  it('passes the server-built scope, the project, the actor and the run and ticket to the index', async () => {
    const scope = workerScope({ tags: ['db'], include_rejected: false });
    const { fake } = await search(scope, {
      query: 'storage',
      kinds: ['decision'],
      tags: ['db'],
      k: 3,
    });

    expect(fake.searches).toEqual([
      {
        project: 'forge',
        text: 'storage',
        kinds: ['decision'],
        tags: ['db'],
        k: 3,
        scope,
        actor: 'worker',
        run_id: run().id,
        ticket_id: 'SF-1',
      },
    ]);
  });

  it('defaults k to 8 and sends no kinds or tags the Worker did not give', async () => {
    const { fake } = await search(directorScope(), { query: 'storage' });
    const sent = fake.searches[0];

    expect(sent?.k).toBe(8);
    expect(sent && 'kinds' in sent).toBe(false);
    expect(sent && 'tags' in sent).toBe(false);
  });
});

describe('memory_search inputs', () => {
  const spec = FORGE_TOOLS.find((t) => t.name === 'memory_search');
  const ctx = { deps: {}, run: run(), now: () => new Date(), newId: () => 'x' } as never;

  it('is a read tool', () => {
    expect(spec?.risk).toBe('read');
  });

  it.each([
    { query: 'x', project: 'other' },
    { query: 'x', status: ['pending'] },
    { query: 'x', scope: { kinds: ['outcome'] } },
    { query: 'x', kinds: ['proposal'] },
    { query: '' },
    { query: 'x', k: 16 },
  ])('refuses %j before any lookup', async (args) => {
    await expect(spec?.run(ctx, args)).rejects.toThrow(
      /invalid arguments for memory_search/,
    );
  });
});

describe('memory_search answers', () => {
  it('cuts a long answer to 2,500 characters and says so', async () => {
    const many: FakeRecord[] = Array.from({ length: 15 }, (_, i) => ({
      project: 'forge',
      id: `d-${String(i + 1).padStart(4, '0')}`,
      kind: 'decision' as const,
      status: 'active' as const,
      statement: `storage ${'word '.repeat(40)}${i}`,
      tags: ['alpha', 'beta', 'gamma'],
    }));

    const { text } = await search(
      workerScope({ tags: [], include_rejected: false }),
      { query: 'storage', k: 15 },
      many,
    );

    const out = JSON.parse(text) as {
      hits: unknown[];
      truncated: boolean;
      total: number;
    };

    expect(text.length).toBeLessThanOrEqual(2_500);
    expect(out.truncated).toBe(true);
    expect(out.total).toBe(15);
    expect(out.hits.length).toBeLessThan(15);
  });

  it('answers a search with no match as an empty list, not an error', async () => {
    const { text, result } = await search(
      workerScope({ tags: [], include_rejected: false }),
      {
        query: 'zzzz',
      },
    );

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text)).toMatchObject({ hits: [], total: 0, truncated: false });
  });

  it('says not_found when the server cannot place the run in a project', async () => {
    const fake = fakeMemory(RECORDS);
    const { client, close } = await connect({
      memory: fake.index,
      memoryScope: async () => null,
    });

    closer.set(close);
    const result = await client.callTool({
      name: 'memory_search',
      arguments: { query: 'storage' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^not_found:/);
    expect(fake.searches).toEqual([]);
  });

  it('says invalid_input when memory is not set up, never an empty success', async () => {
    const { client, close } = await connect();
    closer.set(close);
    const result = await client.callTool({
      name: 'memory_search',
      arguments: { query: 'storage' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^invalid_input: .*not configured/);
  });
});
