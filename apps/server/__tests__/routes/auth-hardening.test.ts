/**
 * Hardening of the browser sign-in: unsafe methods, the token proof and response headers.
 *
 * Why: the session cookie is sent by the browser on its own, so the CSRF check must hold for
 *   every method that is not GET or HEAD, not just the four a list remembers; the CLI hands
 *   the install token only to a server that can answer a challenge with an HMAC of it; and no
 *   API reply may be embedded by a page from another origin. Pinned on the real router, guard
 *   and session store.
 *
 * Pins: logout clears an expired or unknown cookie and still needs the Origin; OPTIONS and unknown methods on a cookie need a matching Origin (bearer does not);
 *   `/auth/proof` answers HMAC-SHA256(token, nonce), never the token, rejects a bad nonce and a
 *   foreign Host; API JSON carries `Cross-Origin-Resource-Policy: same-origin`.
 * Depends on: src/routes/auth, src/services/auth, helpers/http-rig. IO: a loopback socket.
 */

import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authRoutes } from '#/routes/auth.js';
import { createAuthGuard } from '#/services/auth/guard.js';
import { createTokenProver } from '#/services/auth/proof.js';
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
  ];

  rig = await startHttp(
    [
      ...authRoutes({
        tickets,
        sessions,
        prover: createTokenProver(TEST_INSTALL_TOKEN),
      } as unknown as RouteDeps),
      ...probes,
    ],
    createAuthGuard(TEST_INSTALL_TOKEN, tickets, sessions),
  );
});

afterEach(async () => {
  await rig.close();
});

const noToken = {} as const;
const origin = (): string => rig.url;
const post = (path: string, cookie: string, extra: Record<string, string> = {}) =>
  rig.raw('POST', path, { cookie, 'content-type': 'application/json', ...extra }, '{}');

/** Signs in the way a browser does and returns the `Cookie` header it would send. */
async function signIn(): Promise<string> {
  const code = await rig.raw('POST', '/auth/open-code', bearer(TEST_INSTALL_TOKEN));
  const res = await rig.raw(
    'GET',
    `/auth/open?code=${encodeURIComponent((JSON.parse(code.text) as { code: string }).code)}`,
  );

  const set = res.headers['set-cookie'];
  const first = Array.isArray(set) ? set[0] : set;

  return (first ?? '').split(';')[0] ?? '';
}

describe('a cookie request is checked for every method except GET and HEAD', () => {
  it.each(['OPTIONS', 'PROPFIND', 'PUT', 'DELETE', 'PATCH'])(
    'refuses %s without a matching Origin',
    async (method) => {
      const cookie = await signIn();

      const res = await rig.raw(method, '/things/a', { cookie });

      expect(res.status).toBe(403);
      expect(JSON.parse(res.text)).toMatchObject({ error: { code: 'bad_origin' } });
    },
  );

  it('does not ask GET for an Origin', async () => {
    const cookie = await signIn();

    const res = await rig.raw('GET', '/things/a', { cookie });

    expect(res.status).toBe(200);
  });

  it('lets a bearer caller use an unusual method with no Origin', async () => {
    const res = await rig.raw('OPTIONS', '/things/a', bearer(TEST_INSTALL_TOKEN));

    expect(res.status).toBe(405);
  });
});

describe('POST /auth/proof', () => {
  const nonce = 'n'.repeat(32);
  const ask = (body: string) =>
    rig.raw('POST', '/auth/proof', { 'content-type': 'application/json' }, body);

  it('answers HMAC-SHA256(token, nonce) to a caller with no credentials', async () => {
    const res = await ask(JSON.stringify({ nonce }));

    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual({
      proof: createHmac('sha256', TEST_INSTALL_TOKEN).update(nonce).digest('hex'),
    });
  });

  it('never returns the token and refuses a short or missing nonce', async () => {
    const ok = await ask(JSON.stringify({ nonce }));
    const short = await ask(JSON.stringify({ nonce: 'abc' }));
    const missing = await ask('{}');

    expect(ok.text).not.toContain(TEST_INSTALL_TOKEN);
    expect([short.status, missing.status]).toEqual([400, 400]);
  });

  it('is refused on a foreign Host like every other route', async () => {
    const res = await rig.raw(
      'POST',
      '/auth/proof',
      { host: 'evil.example', 'content-type': 'application/json' },
      JSON.stringify({ nonce }),
    );

    expect(res.status).toBe(403);
  });
});

describe('API JSON responses', () => {
  it('are same-origin only for cross-origin embedding', async () => {
    const ok = await rig.raw('GET', '/things/a', bearer(TEST_INSTALL_TOKEN));
    const refused = await rig.raw('GET', '/things/a', noToken);

    expect(ok.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(refused.headers['cross-origin-resource-policy']).toBe('same-origin');
  });
});

describe('POST /auth/logout when the session is already gone', () => {
  it('clears a cookie whose session is gone, with no token and no session', async () => {
    const cookie = await signIn();
    clock.now += 31 * 24 * 3_600_000;

    const expired = await post('/auth/logout', cookie, { origin: origin() });
    const unknown = await post('/auth/logout', 'forge_session=guess', {
      origin: origin(),
    });

    const none = await rig.raw('POST', '/auth/logout', noToken);

    for (const res of [expired, unknown, none]) {
      expect(res.status).toBe(204);
      expect(String(res.headers['set-cookie'])).toBe(
        'forge_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
      );
    }
  });

  it('works with the install token alone', async () => {
    const res = await rig.raw('POST', '/auth/logout', bearer(TEST_INSTALL_TOKEN));

    expect(res.status).toBe(204);
  });

  it.each([
    ['a live cookie', true],
    ['a dead cookie', false],
  ])('refuses %s from another origin and keeps the session', async (_n, live) => {
    const cookie = live ? await signIn() : 'forge_session=guess';

    const res = await post('/auth/logout', cookie, { origin: 'https://evil.example' });
    const after = live ? await rig.raw('GET', '/things/a', { cookie }) : undefined;

    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(JSON.parse(res.text)).toMatchObject({ error: { code: 'bad_origin' } });
    if (after) {
      expect(after.status).toBe(200);
    }
  });
});
