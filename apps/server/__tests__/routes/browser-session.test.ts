/**
 * The browser sign-in over real HTTP: code exchange, cookie, CSRF, Host, SSE ticket, logout.
 *
 * Why: the control room has no credential in its JavaScript; the browser carries an HttpOnly
 *   cookie that the CLI's one-time link set. A cookie is sent by the browser on its own, so
 *   this is where a hostile page on another local port, a forged Host (DNS rebinding) or a
 *   replayed link would get in if any rule were missing. Each rule is pinned on the real
 *   router with the real guard and session store.
 *
 * Pins: open-code needs the install token (not a session); `/auth/open` sets the cookie with
 *   the right flags and redirects to `/`; replay, wrong and expired codes get 401 and no
 *   cookie; the cookie authenticates reads and (with a same-origin `Origin`) writes; a missing
 *   or foreign Origin on a cookie write is 403 while a bearer write with a foreign Origin is
 *   not; a Host on another port or name is 403; the SSE ticket works with the cookie; logout
 *   ends the session and clears the cookie; the cookie is also accepted under `/api`.
 * Depends on: src/routes/auth, src/services/auth, helpers/http-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authRoutes } from '#/routes/auth.js';
import { createAuthGuard } from '#/services/auth/guard.js';
import { createSessionStore } from '#/services/auth/sessions.js';
import { createSseTicketIssuer } from '#/services/auth/sse-tickets.js';
import { sendJson } from '#/services/http/respond.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { TEST_INSTALL_TOKEN, bearer } from '#tests/helpers/install-token.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

let rig: HttpRig;
let clock: { now: number };

beforeEach(async () => {
  clock = { now: 5_000_000 };
  const tickets = createSseTicketIssuer(() => clock.now);
  const sessions = createSessionStore(() => clock.now);
  const probes: Route[] = [
    {
      method: 'GET',
      path: '/things/:id',
      handle: async ({ res, params }) => sendJson(res, 200, { id: params['id'] }),
    },
    {
      method: 'POST',
      path: '/things',
      handle: async ({ res }) => sendJson(res, 201, { made: true }),
    },
  ];

  rig = await startHttp(
    [...authRoutes({ tickets, sessions } as unknown as RouteDeps), ...probes],
    createAuthGuard(TEST_INSTALL_TOKEN, tickets, sessions),
  );
});

afterEach(async () => {
  await rig.close();
});

const noToken = {} as const;

async function newCode(): Promise<string> {
  const res = await rig.raw('POST', '/auth/open-code', {
    ...bearer(TEST_INSTALL_TOKEN),
    'content-type': 'application/json',
  });

  return (JSON.parse(res.text) as { code: string }).code;
}

/** Signs in the way a browser does and returns the `Cookie` header it would send. */
async function signIn(): Promise<string> {
  const res = await rig.raw(
    'GET',
    `/auth/open?code=${encodeURIComponent(await newCode())}`,
  );

  const set = res.headers['set-cookie'];

  const first = Array.isArray(set) ? set[0] : set;

  return (first ?? '').split(';')[0] ?? '';
}

const origin = (): string => rig.url;
const post = (path: string, cookie: string, extra: Record<string, string> = {}) =>
  rig.raw('POST', path, { cookie, 'content-type': 'application/json', ...extra }, '{}');

describe('POST /auth/open-code', () => {
  it('hands a code to the install token', async () => {
    const res = await rig.raw('POST', '/auth/open-code', bearer(TEST_INSTALL_TOKEN));

    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ expires_in_s: 60 });
  });

  it('refuses no credentials and refuses a session', async () => {
    const cookie = await signIn();

    const anonymous = await rig.raw('POST', '/auth/open-code', noToken);
    const session = await post('/auth/open-code', cookie, { origin: origin() });

    expect([anonymous.status, session.status]).toEqual([401, 401]);
  });
});

describe('GET /auth/open', () => {
  it('sets an HttpOnly SameSite=Strict cookie and redirects to /', async () => {
    const code = await newCode();

    const res = await rig.raw('GET', `/auth/open?code=${code}`);

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(String(res.headers['set-cookie'])).toMatch(
      /^forge_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=\d+$/,
    );
  });

  it('refuses a replayed code with a plain page and no cookie', async () => {
    const code = await newCode();
    await rig.raw('GET', `/auth/open?code=${code}`);

    const replay = await rig.raw('GET', `/auth/open?code=${code}`);

    expect(replay.status).toBe(401);
    expect(replay.headers['set-cookie']).toBeUndefined();
    expect(replay.headers['content-type']).toContain('text/html');
    expect(replay.text).toContain('forge open');
    expect(replay.text).not.toContain(code);
  });

  it.each([
    ['a wrong code', 'nope'],
    ['no code', ''],
  ])('refuses %s', async (_n, code) => {
    const res = await rig.raw('GET', `/auth/open?code=${code}`);

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a code after 60 seconds', async () => {
    const code = await newCode();
    clock.now += 60_000;

    const res = await rig.raw('GET', `/auth/open?code=${code}`);

    expect(res.status).toBe(401);
  });
});

describe('the session cookie as a credential', () => {
  it('lets a read through, at the bare path and under /api', async () => {
    const cookie = await signIn();

    const bare = await rig.raw('GET', '/things/a', { cookie });
    const api = await rig.raw('GET', '/api/things/a', { cookie });

    expect([bare.status, api.status]).toEqual([200, 200]);
  });

  it('refuses a made-up cookie', async () => {
    const res = await rig.raw('GET', '/things/a', { cookie: 'forge_session=guess' });

    expect(res.status).toBe(401);
  });

  it('lets a write through from the same origin', async () => {
    const cookie = await signIn();

    const res = await post('/things', cookie, { origin: origin() });

    expect(res.status).toBe(201);
  });

  it.each([
    ['no Origin', {}],
    ['another port', { origin: 'http://127.0.0.1:9' }],
    ['another site', { origin: 'https://evil.example' }],
    ['a null origin', { origin: 'null' }],
  ])('refuses a write with %s', async (_name, extra) => {
    const cookie = await signIn();

    const res = await post('/things', cookie, extra);

    expect(res.status).toBe(403);
    expect(JSON.parse(res.text)).toMatchObject({ error: { code: 'bad_origin' } });
  });

  it('does not ask a bearer caller for an Origin', async () => {
    const res = await rig.raw(
      'POST',
      '/things',
      {
        ...bearer(TEST_INSTALL_TOKEN),
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:5173',
      },
      '{}',
    );

    expect(res.status).toBe(201);
  });

  it('gives an SSE ticket to a session from the same origin', async () => {
    const cookie = await signIn();

    const res = await rig.raw(
      'POST',
      '/auth/sse-ticket',
      { cookie, origin: origin(), 'content-type': 'application/json' },
      JSON.stringify({ run_id: 'run-1' }),
    );

    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ expires_in_s: 60 });
  });
});

describe('the Host header', () => {
  it.each([
    ['another name', 'evil.example'],
    ['a rebound name with the port', 'evil.example:80'],
    ['loopback on another port', '127.0.0.1:1'],
    ['loopback with no port', '127.0.0.1'],
  ])('is refused for %s', async (_name, host) => {
    const res = await rig.raw('GET', '/things/a', {
      host,
      ...bearer(TEST_INSTALL_TOKEN),
    });

    expect(res.status).toBe(403);
    expect(JSON.parse(res.text)).toMatchObject({ error: { code: 'bad_host' } });
  });

  it('accepts localhost on the right port', async () => {
    const port = new URL(rig.url).port;

    const res = await rig.raw('GET', '/things/a', {
      host: `localhost:${port}`,
      ...bearer(TEST_INSTALL_TOKEN),
    });

    expect(res.status).toBe(200);
  });
});

describe('POST /auth/logout', () => {
  it('ends the session and clears the cookie', async () => {
    const cookie = await signIn();

    const out = await post('/auth/logout', cookie, { origin: origin() });
    const after = await rig.raw('GET', '/things/a', { cookie });

    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toBe(
      'forge_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    );

    expect(after.status).toBe(401);
  });

  it('needs credentials and, for a cookie, the same origin', async () => {
    const cookie = await signIn();

    const anonymous = await rig.raw('POST', '/auth/logout', noToken);
    const crossSite = await post('/auth/logout', cookie, {
      origin: 'https://evil.example',
    });

    expect([anonymous.status, crossSite.status]).toEqual([401, 403]);
  });
});
