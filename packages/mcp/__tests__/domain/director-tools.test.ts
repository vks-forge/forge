/**
 * Pins the Worker tools that talk to the Director.
 *
 * Why: ask_director, report_blocked and finish are how a Worker raises a question,
 *   escalates when stuck and claims it is done. What they store decides whether a
 *   question reaches a human, whether a blocked Worker escalates its lane, and whether
 *   G1 can check the Worker's claims. These tests run through the real MCP protocol
 *   against storage so a changed row shape shows up as a failure.
 *
 * Pins: ask_director, one pending interaction per run, report_blocked, finish.
 * Depends on: helpers/harness, helpers/auto-close, domain/server.
 */

import { describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { RUN_ID, connect, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

async function setup() {
  const c = await connect();
  closer.set(c.close);

  return c;
}

describe('ask_director', () => {
  it('stores a pending question interaction and returns its id', async () => {
    const { client, storage } = await setup();
    const res = await client.callTool({
      name: 'ask_director',
      arguments: { question: 'Which db?' },
    });

    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res));
    expect(body.status).toBe('pending');
    expect(body.instruction).toMatch(/stop/i);
    const row = await storage.transaction((tx) =>
      tx.interactions.get(body.interaction_id),
    );

    expect(row).toMatchObject({
      ticket_id: 'SF-1',
      run_id: RUN_ID,
      kind: 'question',
      status: 'pending',
      payload: { question: 'Which db?' },
    });

    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events[0]).toMatchObject({
      type: 'ask',
      interaction_id: body.interaction_id,
      prompt: 'Which db?',
    });
  });

  it('sets a timeout in the future', async () => {
    const { client, storage } = await setup();
    const res = await client.callTool({
      name: 'ask_director',
      arguments: { question: 'q' },
    });

    const id = JSON.parse(textOf(res)).interaction_id as string;
    const row = await storage.transaction((tx) => tx.interactions.get(id));
    expect(Date.parse(row?.timeout_at ?? '')).toBeGreaterThan(
      Date.parse(row?.asked_at ?? ''),
    );
  });
});

describe('one pending interaction per run', () => {
  const args = (n: string) =>
    n === 'ask_director' ? { question: 'q' } : { reason: 'r' };

  it.each([
    ['ask_director', 'report_blocked'],
    ['report_blocked', 'ask_director'],
    ['ask_director', 'ask_director'],
  ] as const)('%s then %s is refused', async (first, second) => {
    const { client, storage } = await setup();
    const a = await client.callTool({ name: first, arguments: args(first) });
    expect(a.isError).toBeFalsy();
    const again = await client.callTool({ name: second, arguments: args(second) });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toMatch(/pending/i);
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events).toHaveLength(1);
  });

  it('is allowed again once the earlier interaction is settled', async () => {
    const { client, storage } = await setup();
    const first = await client.callTool({
      name: 'ask_director',
      arguments: { question: 'q' },
    });

    const id = JSON.parse(textOf(first)).interaction_id as string;
    await storage.transaction((tx) => tx.interactions.update(id, { status: 'answered' }));
    const next = await client.callTool({
      name: 'ask_director',
      arguments: { question: 'q2' },
    });

    expect(next.isError).toBeFalsy();
  });
});

describe('report_blocked', () => {
  it('stores a blocked interaction the Director can escalate on', async () => {
    const { client, storage } = await setup();
    const res = await client.callTool({
      name: 'report_blocked',
      arguments: { reason: 'needs the prod key' },
    });

    expect(res.isError).toBeFalsy();
    const id = JSON.parse(textOf(res)).interaction_id as string;
    const row = await storage.transaction((tx) => tx.interactions.get(id));
    expect(row).toMatchObject({
      kind: 'blocked',
      status: 'pending',
      payload: { reason: 'needs the prod key', source: 'report_blocked' },
    });

    expect(row?.payload).not.toHaveProperty('subtype');
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events[0]).toMatchObject({ type: 'ask', kind: 'blocked' });
    expect((events[0] as { prompt: string }).prompt).toMatch(/^BLOCKED/);
  });
});

describe('finish', () => {
  it('records a finish event with typed claims', async () => {
    const { client, storage } = await setup();
    const claims = [
      { kind: 'ran_tests' },
      { kind: 'edited', path: 'src/a.ts' },
      { kind: 'added_test', name: 'rejects empty input' },
      { kind: 'read', path: 'docs/x.md' },
    ];

    const res = await client.callTool({
      name: 'finish',
      arguments: { summary: 'done', claims },
    });

    expect(res.isError).toBeFalsy();
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'finish',
      summary: 'done',
      structured: { claims },
    });
  });

  it('rejects unknown claim kinds and extra claim fields', async () => {
    const { client, storage } = await setup();
    const bad = await client.callTool({
      name: 'finish',
      arguments: { summary: 's', claims: [{ kind: 'deployed', env: 'prod' }] },
    });

    expect(bad.isError).toBe(true);
    const extra = await client.callTool({
      name: 'finish',
      arguments: { summary: 's', claims: [{ kind: 'ran_tests', passed: true }] },
    });

    expect(extra.isError).toBe(true);
    expect(await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID))).toEqual([]);
  });

  it('defaults claims to empty and refuses a second finish', async () => {
    const { client } = await setup();
    const first = await client.callTool({ name: 'finish', arguments: { summary: 's' } });
    expect(first.isError).toBeFalsy();
    const second = await client.callTool({
      name: 'finish',
      arguments: { summary: 's2' },
    });

    expect(second.isError).toBe(true);
    expect(textOf(second)).toMatch(/already/i);
  });
});
