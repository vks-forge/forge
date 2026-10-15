/**
 * Pins: the http adapter calls the real ticket, interaction and intake endpoints with the
 * right paths and bodies and validates answers; the mock adapter behaves like the server
 * (paging, state filter, 404, one-time answers, dedupe, scripted stream); the stream helper
 * reports connection state so a quiet run is not mistaken for a dead one.
 *
 * Why: the Board and Ticket page are written once against the port. If the http adapter built
 *   a wrong URL the Board would silently show nothing; if the mock drifted from the server
 *   (an answer accepted twice) tests and the fixture build would teach the UI the wrong
 *   thing.
 * Depends on: src/api/http/http-adapter, src/api/mock/mock-adapter, src/api/sse/watch-run-events.
 */

import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { fakeTicketsFor } from '#tests/helpers/fake-tickets/fake-scenario.js';
import type { ForgeApiAdapter } from '#/types/api.types.js';

const summary = {
  id: 'SVC-1',
  title: 'T',
  state: 'inbox',
  lane: 'express',
  type: 'feat',
  tier_predicted: 'A',
  project: 'alpha',
  priority: 0,
  rework_count: 0,
  needs_you: false,
  created_at: '2026-10-16T00:00:00.000Z',
  updated_at: '2026-10-16T00:00:00.000Z',
};

describe('http adapter: tickets', () => {
  const adapter = (fetch: typeof globalThis.fetch) =>
    createHttpAdapter({ baseUrl: '/api', fetch });

  it('asks for a project page with limit, cursor and states', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [summary], nextCursor: 'c2' }));

    const page = await adapter(fetch).tickets!.list({
      slug: 'a b',
      limit: 50,
      cursor: 'c1',
      state: ['inbox', 'planned'],
    });

    expect(page.nextCursor).toBe('c2');
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/projects/a%20b/tickets?limit=50&cursor=c1&state=inbox%2Cplanned',
    );
  });

  it('adds no query when nothing narrows the list, and rejects a bad item', async () => {
    const ok = vi.fn().mockResolvedValue(Response.json({ items: [], nextCursor: null }));
    await adapter(ok).tickets!.list({ slug: 'alpha' });
    expect(ok.mock.calls[0]?.[0]).toBe('/api/projects/alpha/tickets');

    const bad = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [{ ...summary, state: 'bogus' }], nextCursor: null }),
      );

    await expect(adapter(bad).tickets!.list({ slug: 'alpha' })).rejects.toMatchObject({
      kind: 'payload',
    });
  });

  it('turns a 404 ticket into a typed refusal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'ticket_not_found', message: 'no ticket' } },
          { status: 404 },
        ),
      );

    await expect(adapter(fetch).tickets!.get('SVC-9')).rejects.toMatchObject({
      status: 404,
      code: 'ticket_not_found',
    });
  });

  it('posts the answer once as { answer }', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 'i1', status: 'answered' }));

    await adapter(fetch).interactions!.answer('i1', 'UTC');

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/interactions/i1/answer');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ answer: 'UTC' });
  });

  it('files a chat request as a full intake event keyed by the project id', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ status: 'ticket_created', ticketId: 'SVC-2' }, { status: 202 }),
      );

    const reply = await adapter(fetch).intake!.chat({
      projectId: 'p1',
      text: 'Do it',
      dedupeKey: 'k1',
    });

    expect(reply).toEqual({ status: 'ticket_created', ticketId: 'SVC-2' });
    const body = JSON.parse((fetch.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      source: 'chat',
      kind: 'new_request',
      dedupe_key: 'k1',
      project: 'p1',
      payload: { text: 'Do it' },
    });
  });
});

describe('fake ticket server (test helper)', () => {
  const mock = fakeTicketsFor as (
    scenario?: 'ok' | 'empty' | 'error',
  ) => Required<
    Pick<ForgeApiAdapter, 'tickets' | 'interactions' | 'runEvents' | 'intake'>
  >;

  it('pages with an opaque cursor and filters by state', async () => {
    const { tickets } = mock();

    const first = await tickets.list({ slug: 'sample-service', limit: 4 });
    const second = await tickets.list({
      slug: 'sample-service',
      limit: 4,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
    });

    const done = await tickets.list({ slug: 'sample-service', state: ['done'] });

    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(done.items.every((t) => t.state === 'done')).toBe(true);
    expect(done.nextCursor).toBeNull();
  });

  it('marks tickets that wait on the user and knows the live run', async () => {
    const page = await mock().tickets.list({ slug: 'sample-service' });

    expect(page.items.find((t) => t.id === 'SVC-4')).toMatchObject({
      needs_you: true,
      run_id: 'run-svc-4',
    });

    expect(page.items.find((t) => t.id === 'SVC-3')?.run_status).toBe('running');
  });

  it('refuses unknown projects and tickets with 404 and fails on the error scenario', async () => {
    const { tickets } = mock();

    await expect(tickets.list({ slug: 'nope' })).rejects.toMatchObject({ status: 404 });
    await expect(tickets.get('SVC-999')).rejects.toMatchObject({ status: 404 });
    await expect(
      mock('error').tickets.list({ slug: 'sample-service' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect((await mock('empty').tickets.list({ slug: 'sample-service' })).items).toEqual(
      [],
    );
  });

  it('accepts an answer once, then 409, and wakes the ticket', async () => {
    const { tickets, interactions } = mock();
    const before = await tickets.get('SVC-4');
    expect(before.interactions).toHaveLength(1);

    await interactions.answer('int-svc-4', 'UTC');

    await expect(interactions.answer('int-svc-4', 'again')).rejects.toMatchObject({
      status: 409,
    });

    await expect(interactions.answer('nope', 'x')).rejects.toMatchObject({ status: 404 });
    const after = await tickets.get('SVC-4');
    expect(after.interactions).toHaveLength(0);
    expect(after.ticket.status).toBe('in_progress');
  });

  it('creates an inbox ticket from chat once per dedupe key', async () => {
    const { tickets, intake } = mock();

    const first = await intake.chat({
      projectId: 'fixture-1',
      text: 'Add a thing',
      dedupeKey: 'k',
    });

    const second = await intake.chat({
      projectId: 'fixture-1',
      text: 'Add a thing',
      dedupeKey: 'k',
    });

    const unknown = await intake.chat({ projectId: 'zzz', text: 'x', dedupeKey: 'k2' });

    expect(first).toMatchObject({ status: 'ticket_created', ticketId: 'SVC-12' });
    expect(second).toEqual({ status: 'duplicate' });
    expect(unknown.status).toBe('ignored');
    expect((await tickets.get('SVC-12')).ticket.status).toBe('inbox');
  });

  it('plays a finished run and ends, and keeps a live run open', async () => {
    vi.useFakeTimers();
    try {
      const { runEvents } = mock();
      const finished: number[] = [];
      const ends: string[] = [];
      const states: string[] = [];
      runEvents.watch({
        runId: 'run-svc-1',
        onEvent: (e) => finished.push(e.seq),
        onEnd: (s) => ends.push(s),
        onError: () => undefined,
        onConnection: (s) => states.push(s),
      });

      const live: number[] = [];
      const liveEnds: string[] = [];
      const watch = runEvents.watch({
        runId: 'run-svc-3',
        onEvent: (e) => live.push(e.seq),
        onEnd: (s) => liveEnds.push(s),
        onError: () => undefined,
      });

      await vi.advanceTimersByTimeAsync(50);

      expect(finished.length).toBeGreaterThan(3);
      expect(ends).toEqual(['success']);
      expect(states).toEqual(['connecting', 'open']);
      expect(live.length).toBeGreaterThan(3);
      expect(liveEnds).toEqual([]);

      watch.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
