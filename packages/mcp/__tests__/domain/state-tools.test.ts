/**
 * Pins the five tools that write Worker intent into Forge state.
 *
 * Why: get_ticket, add_comment, ask_director, report_blocked and finish are how a
 *   Worker talks to the Director. What they store decides whether a question reaches a
 *   human, whether a blocked Worker escalates its lane, and whether G1 can check the
 *   Worker's claims. These tests run through the real MCP protocol against storage so
 *   a changed row shape or a missing scope check shows up as a failure.
 *
 * Pins: get_ticket, add_comment, ask_director, report_blocked, finish.
 * Depends on: helpers/harness, domain/server.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { RUN_ID, TICKET_ID, connect, textOf } from '#tests/helpers/harness.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function setup() {
  const c = await connect();
  close = c.close;
  return c;
}

describe('tool list', () => {
  it('serves exactly the eight Forge tools', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'ask_director',
      'docs_lookup',
      'finish',
      'get_ticket',
      'report_blocked',
      'web_fetch',
      'web_search',
    ]);
  });
});

describe('get_ticket', () => {
  it('returns the run ticket with relations and runs', async () => {
    const { client } = await setup();
    const res = await client.callTool({ name: 'get_ticket', arguments: { id: 'SF-1' } });
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res));
    expect(body.ticket.id).toBe('SF-1');
    expect(body.relations.parent).toMatchObject({ id: 'SF-9' });
    expect(body.relations.blocked_by).toEqual([
      { id: 'SF-2', title: 'Ticket 2', status: 'done' },
    ]);
    expect(body.runs).toEqual([
      expect.objectContaining({ id: RUN_ID, status: 'running' }),
    ]);
  });

  it('allows a direct relation (parent) but refuses an unrelated ticket', async () => {
    const { client } = await setup();
    const ok = await client.callTool({ name: 'get_ticket', arguments: { id: 'SF-9' } });
    expect(ok.isError).toBeFalsy();
    const no = await client.callTool({ name: 'get_ticket', arguments: { id: 'SF-5' } });
    expect(no.isError).toBe(true);
    expect(textOf(no)).toMatch(/not related/i);
  });

  it('reports a missing ticket as a tool error', async () => {
    const { client, storage } = await setup();
    await storage.transaction(async (tx) => {
      await tx.tickets.updateTicketCas(TICKET_ID, 1, { blocked_by: [] });
    });
    const res = await client.callTool({ name: 'get_ticket', arguments: { id: 'SF-77' } });
    expect(res.isError).toBe(true);
  });
});

describe('add_comment', () => {
  it('stores the comment as a text run event on the run', async () => {
    const { client, storage } = await setup();
    const res = await client.callTool({
      name: 'add_comment',
      arguments: { ticket: 'SF-1', text: 'found the cause' },
    });
    expect(res.isError).toBeFalsy();
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text', seq: 0 });
    expect((events[0] as { text: string }).text).toContain('found the cause');
    expect((events[0] as { text: string }).text).toContain('SF-1');
  });

  it('refuses a comment on another ticket', async () => {
    const { client, storage } = await setup();
    const res = await client.callTool({
      name: 'add_comment',
      arguments: { ticket: 'SF-5', text: 'x' },
    });
    expect(res.isError).toBe(true);
    expect(await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID))).toEqual([]);
  });

  it('assigns increasing seq numbers', async () => {
    const { client, storage } = await setup();
    for (const text of ['a', 'b']) {
      await client.callTool({ name: 'add_comment', arguments: { ticket: 'SF-1', text } });
    }
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
  });
});

describe('run event numbering', () => {
  it('shares one seq space with the driver: a driver-written event never collides with a tool event', async () => {
    const { client, storage } = await setup();
    await storage.transaction((tx) =>
      tx.runEvents.append(RUN_ID, {
        type: 'usage',
        ts: '2026-10-13T00:00:00.000Z',
        usage: { in: 1, out: 1, cachedIn: 0, cacheWrite: 0 },
      }),
    );
    const res = await client.callTool({
      name: 'add_comment',
      arguments: { ticket: 'SF-1', text: 'after the driver event' },
    });
    await storage.transaction((tx) =>
      tx.runEvents.append(RUN_ID, {
        type: 'text',
        ts: '2026-10-13T00:00:00.000Z',
        text: 'driver again',
      }),
    );
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toContain('seq 1');
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it('numbers concurrent tool calls without gaps or collisions', async () => {
    const { client, storage } = await setup();
    await Promise.all(
      ['a', 'b', 'c', 'd'].map((text) =>
        client.callTool({ name: 'add_comment', arguments: { ticket: 'SF-1', text } }),
      ),
    );
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });
});

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
      kind: 'question',
      status: 'pending',
      payload: { subtype: 'blocked', reason: 'needs the prod key' },
    });
    const events = await storage.transaction((tx) => tx.runEvents.listByRun(RUN_ID));
    expect(events[0]).toMatchObject({ type: 'ask' });
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
