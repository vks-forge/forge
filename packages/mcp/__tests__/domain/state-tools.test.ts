/**
 * Pins the Worker tools that read and number Forge state.
 *
 * Why: get_ticket and add_comment are how a Worker reads its task and leaves notes, and
 *   every tool event shares one sequence with the driver's own events. A missing scope
 *   check would let a Worker read unrelated tickets; a numbering collision would corrupt
 *   replay. These tests run through the real MCP protocol against storage.
 *
 * Pins: tool list, get_ticket, add_comment, run event numbering.
 * Depends on: helpers/harness, helpers/auto-close, domain/server.
 */

import { describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { RUN_ID, TICKET_ID, connect, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

async function setup() {
  const c = await connect();
  closer.set(c.close);

  return c;
}

describe('tool list', () => {
  it('serves exactly the nine Forge tools', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'ask_director',
      'docs_lookup',
      'finish',
      'get_ticket',
      'report_blocked',
      'submit_review',
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

  it('emits no relations for a related ticket (no second-degree reads)', async () => {
    const { client } = await setup();
    const res = await client.callTool({ name: 'get_ticket', arguments: { id: 'SF-9' } });
    const body = JSON.parse(textOf(res));
    expect(body.ticket.id).toBe('SF-9');
    expect(body.relations).toEqual({ parent: null, blocked_by: [] });
    expect(body.runs).toEqual([]);
  });

  it('reports a missing ticket as a tool error', async () => {
    const { client, storage } = await setup();
    await storage.transaction(async (tx) => {
      await tx.tickets.updateTicketCas(TICKET_ID, 1, { rework_count: 0 });
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
