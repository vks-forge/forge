/**
 * Pins the Worker tool `memory_get` through the MCP protocol: whole records, only inside the server-built scope.
 *
 * Why: after a search a Worker may read up to three records in full. A record outside its scope (a pending
 *   proposal, an outcome, a superseded decision, another project's record, an id that does not exist) must
 *   look exactly the same as a missing one: the same typed `not_found`, so asking by id reveals nothing.
 *   Each record carries who wrote it and where it came from (`author`, `origin`) so the Worker can weigh it,
 *   the answer is capped so a huge body cannot flood the context, and the call leaves the run and ticket
 *   for the access log (d-0067, d-0168).
 *
 * Pins: memory_get.
 * Depends on: helpers/harness, helpers/fake-memory, helpers/auto-close, @forge/core.
 */

import { MEMORY_NOTICE, workerScope } from '@forge/core';
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
    body: 'Because the owner said so.',
    tags: ['db'],
    author: 'director',
    origin: 'agent',
  },
  {
    project: 'forge',
    id: 'd-0002',
    kind: 'decision',
    status: 'active',
    statement: 'Use REST',
    tags: ['api'],
  },
  {
    project: 'forge',
    id: 'r-0001',
    kind: 'rejected',
    status: 'rejected',
    statement: 'Use mongodb',
    tags: ['db'],
  },
  {
    project: 'forge',
    id: 'x-0001',
    kind: 'proposal',
    status: 'pending',
    statement: 'Use sqlite',
  },
  {
    project: 'forge',
    id: 'o-0001',
    kind: 'outcome',
    status: 'active',
    statement: 'Session',
  },
  {
    project: 'forge',
    id: 'd-0003',
    kind: 'decision',
    status: 'superseded',
    statement: 'Use mysql',
  },
  {
    project: 'other',
    id: 'd-0009',
    kind: 'decision',
    status: 'active',
    statement: 'Elsewhere',
  },
];

async function get(args: Record<string, unknown>, rejected = false, records = RECORDS) {
  const fake = fakeMemory(records);
  const scope = workerScope({ tags: [], include_rejected: rejected });
  const { client, close } = await connect({ ...workerMemory(fake, scope) });
  closer.set(close);
  const result = await client.callTool({ name: 'memory_get', arguments: args });

  return { fake, result, text: textOf(result) };
}

describe('memory_get', () => {
  it('returns the records with notice, author and origin', async () => {
    const { text, result } = await get({ ids: ['d-0001', 'd-0002'] });
    const out = JSON.parse(text) as {
      notice: string;
      records: { id: string; author: string; origin: string; body: string }[];
    };

    expect(result.isError).toBeFalsy();
    expect(out.notice).toBe(MEMORY_NOTICE);
    expect(out.records.map((r) => r.id)).toEqual(['d-0001', 'd-0002']);
    expect(out.records[0]).toMatchObject({
      author: 'director',
      origin: 'agent',
      body: 'Because the owner said so.',
      statement: 'Use postgres',
      tags: ['db'],
    });

    expect(out.records[1]).toMatchObject({ author: 'user', origin: 'owner' });
  });

  it.each([
    ['a pending proposal', 'x-0001'],
    ['an outcome', 'o-0001'],
    ['a superseded decision', 'd-0003'],
    ['another project record', 'd-0009'],
    ['an id that does not exist', 'd-4040'],
    ['a rejected approach the slice excludes', 'r-0001'],
  ])('answers %s with the same not_found as an unknown id', async (_label, id) => {
    const { result, text } = await get({ ids: [id] });

    expect(result.isError).toBe(true);
    expect(text).toBe(`not_found: no memory record ${id} visible to this run`);
  });

  it('shows a rejected approach when the agent slice includes them', async () => {
    const { text } = await get({ ids: ['r-0001'] }, true);

    expect((JSON.parse(text) as { records: { id: string }[] }).records[0]?.id).toBe(
      'r-0001',
    );
  });

  it('names every missing id and returns no partial answer', async () => {
    const { result, text } = await get({ ids: ['d-0001', 'x-0001', 'd-4040'] });

    expect(result.isError).toBe(true);
    expect(text).toBe('not_found: no memory record x-0001, d-4040 visible to this run');
  });

  it('refuses ids it cannot parse, an empty list and more than three', async () => {
    for (const ids of [['nope'], [], ['d-0001', 'd-0002', 'd-0001', 'd-0002']]) {
      const { result, text } = await get({ ids });

      expect(result.isError).toBe(true);
      expect(text).toBeTruthy();
    }
  });

  it('cuts statement plus body to 4,000 characters and marks the cut', async () => {
    const big: FakeRecord[] = [
      {
        project: 'forge',
        id: 'd-0001',
        kind: 'decision',
        status: 'active',
        statement: 'Use postgres',
        body: 'x'.repeat(50_000),
      },
    ];

    const { text } = await get({ ids: ['d-0001'] }, false, big);
    const rec = (
      JSON.parse(text) as {
        records: { statement: string; body: string; body_truncated: boolean }[];
      }
    ).records[0];

    expect((rec?.statement.length ?? 0) + (rec?.body.length ?? 0)).toBeLessThanOrEqual(
      4_000,
    );

    expect(rec?.body_truncated).toBe(true);
  });

  it('passes the scope, actor, run and ticket to the index', async () => {
    const { fake } = await get({ ids: ['d-0001'] });

    expect(fake.gets).toHaveLength(1);
    expect(fake.gets[0]?.ids).toEqual(['d-0001']);
    expect(fake.gets[0]?.opts).toEqual({
      actor: 'worker',
      scope: workerScope({ tags: [], include_rejected: false }),
      run_id: 'run-1',
      ticket_id: 'SF-1',
    });
  });

  it('says not_found when the run has no project and invalid_input when memory is off', async () => {
    const fake = fakeMemory(RECORDS);
    const placed = await connect({ memory: fake.index, memoryScope: async () => null });
    closer.set(placed.close);
    const none = await placed.client.callTool({
      name: 'memory_get',
      arguments: { ids: ['d-0001'] },
    });

    const off = await connect();
    closer.set(off.close);
    const unset = await off.client.callTool({
      name: 'memory_get',
      arguments: { ids: ['d-0001'] },
    });

    expect(textOf(none)).toMatch(/^not_found:/);
    expect(textOf(unset)).toMatch(/^invalid_input:/);
    expect(fake.gets).toEqual([]);
  });
});
