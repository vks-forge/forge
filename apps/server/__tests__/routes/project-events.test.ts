/**
 * `GET /projects/:slug/events` and the project SSE ticket, end to end.
 *
 * Why: the control room updates the Board, the Card page and the Inbox from this stream
 *   instead of polling (d-0132). It must open with a ticket (an `EventSource` cannot send
 *   headers), the ticket must open this project only and never a run (and a run ticket never
 *   this stream), a write made through the real routes must arrive as one `invalidate` frame
 *   naming the stale queries, and an idle stream must keep itself alive. A stream that leaked
 *   across projects would show one team's card ids to another.
 *
 * Pins: 404 unknown project, 401 without a credential; the ticket mint (project or run, not
 *   both, not neither); a project ticket opens its project, not another project, not a run
 *   stream, and a run ticket does not open the project stream; the install token also opens
 *   it; a created card produces `event: invalidate` with the exact query keys; a project's
 *   frames do not reach another project; heartbeat comments; the stream closes at shutdown.
 * Depends on: helpers/flow-rig, vitest. IO: loopback sockets.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startFlowRig } from '#tests/helpers/flow-rig.js';
import type { FlowRig } from '#tests/helpers/flow-rig.js';

let ctx: FlowRig;
let stop: AbortController;

beforeEach(async () => {
  stop = new AbortController();
  ctx = await startFlowRig({ shutdown: stop.signal });
});

afterEach(async () => {
  stop.abort();
  await ctx.close();
});

const mint = async (body: unknown): Promise<string> => {
  const res = await ctx.rig.json('POST', '/auth/sse-ticket', body);

  expect(res.status).toBe(200);

  return (res.body as { ticket: string }).ticket;
};

/** Opens a stream and reads until `done(text)` holds or `ms` passes; returns what arrived. */
async function open(
  path: string,
  done: (text: string) => boolean,
  headers: Record<string, string> = {},
  ms = 3000,
): Promise<{ status: number; type: string | null; text: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  const res = await fetch(`${ctx.rig.url}${path}`, { headers, signal: abort.signal });
  let text = '';
  try {
    if (res.status === 200 && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (!done(text)) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        text += decoder.decode(chunk.value, { stream: true });
      }
    } else {
      text = await res.text();
    }
  } catch {
    // Aborted by the timer: the caller asserts on what arrived.
  } finally {
    clearTimeout(timer);
    abort.abort();
  }

  return { status: res.status, type: res.headers.get('content-type'), text };
}

const create = (slug: string, key: string, over: Record<string, unknown> = {}) =>
  ctx.rig.json('POST', `/projects/${slug}/cards`, {
    title: 'A todo application',
    description: 'Build a small todo application with a list and a form.',
    dedupe_key: key,
    ...over,
  });

const frames = (text: string) =>
  text
    .split('\n\n')
    .filter((f) => f.startsWith('event: invalidate'))
    .map((f) => JSON.parse(f.split('\ndata: ')[1] ?? 'null') as { keys: string[][] });

describe('POST /auth/sse-ticket for a project', () => {
  it('mints a 60 second ticket for a project slug', async () => {
    const res = await ctx.rig.json('POST', '/auth/sse-ticket', { project: 'fixture' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ticket: expect.stringMatching(/^\d+\./),
      expires_in_s: 60,
    });
  });

  it.each([
    ['neither a run nor a project', {}],
    ['both a run and a project', { run_id: 'r', project: 'fixture' }],
    ['an empty project', { project: '' }],
    ['an unknown field', { project: 'fixture', extra: 1 }],
  ])('refuses %s', async (_name, body) => {
    const res = await ctx.rig.json('POST', '/auth/sse-ticket', body);

    expect(res.status).toBe(400);
  });

  it('is only minted for a caller with the install token', async () => {
    const res = await ctx.rig.json(
      'POST',
      '/auth/sse-ticket',
      { project: 'fixture' },
      { authorization: '' },
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /projects/:slug/events: access', () => {
  it('answers 404 for an unknown project and 401 without a credential', async () => {
    const unknown = await open('/projects/nope/events', () => true, ctx.rig.authHeaders);
    const anon = await open('/projects/fixture/events', () => true);

    expect(unknown.status).toBe(404);
    expect(anon.status).toBe(401);
  });

  it('opens with the install token', async () => {
    const res = await open(
      '/projects/fixture/events',
      (t) => t.includes('retry:'),
      ctx.rig.authHeaders,
    );

    expect(res.status).toBe(200);
    expect(res.type).toContain('text/event-stream');
  });

  it('opens with a ticket for this project and no header', async () => {
    const ticket = await mint({ project: 'fixture' });

    const res = await open(`/projects/fixture/events?ticket=${ticket}`, (t) =>
      t.includes('retry:'),
    );

    expect(res.status).toBe(200);
  });

  it('refuses a ticket for another project, a run ticket, an expired one and garbage', async () => {
    const other = await mint({ project: 'other' });
    const run = await mint({ run_id: 'fixture' });
    const old = await mint({ project: 'fixture' });
    ctx.clock.now += 61_000;

    for (const ticket of [other, run, old, 'garbage', '1.2.3']) {
      const res = await open(`/projects/fixture/events?ticket=${ticket}`, () => true);

      expect(res.status, ticket).toBe(401);
    }
  });

  it('does not let a project ticket open a run stream or another route', async () => {
    const ticket = await mint({ project: 'fixture' });

    const run = await fetch(`${ctx.rig.url}/runs/fixture/events?ticket=${ticket}`);
    const cards = await fetch(`${ctx.rig.url}/projects/fixture/cards?ticket=${ticket}`);

    expect(run.status).toBe(401);
    expect(cards.status).toBe(401);
  });
});

describe('GET /projects/:slug/events: messages', () => {
  it('sends one invalidate frame with the exact query keys after a card is created', async () => {
    const ticket = await mint({ project: 'fixture' });
    const reading = open(`/projects/fixture/events?ticket=${ticket}`, (t) =>
      t.includes('event: invalidate'),
    );

    await new Promise((r) => setTimeout(r, 50));
    const res = await create('fixture', 'k1');
    const got = await reading;

    expect(res.status).toBe(201);
    expect(got.text).toContain('event: invalidate\ndata: ');
    const [frame] = frames(got.text);
    expect(frame?.keys).toEqual(
      expect.arrayContaining([
        ['cards', 'fixture'],
        ['card', 'FX-C1'],
      ]),
    );

    expect(
      frame?.keys.every((k) =>
        ['cards', 'card', 'tickets', 'inbox'].includes(k[0] ?? ''),
      ),
    ).toBe(true);
  });

  it('does not send another project the frame', async () => {
    const ticket = await mint({ project: 'other' });
    const reading = open(
      `/projects/other/events?ticket=${ticket}`,
      (t) => t.includes('event: invalidate'),
      {},
      400,
    );

    await new Promise((r) => setTimeout(r, 50));
    await create('fixture', 'k1');
    const got = await reading;

    expect(frames(got.text)).toEqual([]);
  });

  it('tells the stream when a dependency edit or a close changes the card', async () => {
    const a = ((await create('fixture', 'a')).body as { card: { id: string } }).card.id;
    const b = ((await create('fixture', 'b')).body as { card: { id: string } }).card.id;
    const reading = open(
      '/projects/fixture/events',
      (t) => frames(t).length >= 2,
      ctx.rig.authHeaders,
    );

    await new Promise((r) => setTimeout(r, 50));
    await ctx.rig.json('PUT', `/cards/${b}/relations`, { depends_on: [a], blocks: [] });
    await ctx.rig.json('PATCH', `/cards/${a}`, { closed_reason: 'duplicate' });
    const got = await reading;

    const keys = frames(got.text).flatMap((f) => f.keys.map((k) => k.join(':')));

    expect(keys).toEqual(
      expect.arrayContaining(['card:FX-C2', 'card:FX-C1', 'cards:fixture']),
    );
  });

  it('sends a heartbeat comment while idle', async () => {
    const res = await open(
      '/projects/fixture/events',
      (t) => t.includes(': heartbeat'),
      ctx.rig.authHeaders,
    );

    expect(res.text).toContain(': heartbeat\n\n');
  });

  it('replays nothing: a stream opened after the write sees no frame', async () => {
    await create('fixture', 'early');

    const res = await open(
      '/projects/fixture/events',
      (t) => t.includes(': heartbeat'),
      ctx.rig.authHeaders,
    );

    expect(frames(res.text)).toEqual([]);
  });

  it('ends the stream when the server shuts down', async () => {
    const abort = new AbortController();
    const res = await fetch(`${ctx.rig.url}/projects/fixture/events`, {
      headers: ctx.rig.authHeaders,
      signal: abort.signal,
    });

    const reader = res.body?.getReader();
    await reader?.read();
    stop.abort();
    const end = await Promise.race([
      (async () => {
        for (;;) {
          const chunk = await reader?.read();
          if (!chunk || chunk.done) {
            return 'ended';
          }
        }
      })(),
      new Promise((r) => setTimeout(() => r('open'), 2000)),
    ]);

    abort.abort();

    expect(end).toBe('ended');
  });
});
