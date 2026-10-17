/**
 * The built control room served by the router: files, caching, headers, deep links.
 *
 * Why: `forge start` gives the user one URL for the UI. A deep link such as `/tickets/FX-1`
 *   must open the app even though the API has a route of that name; a hashed bundle must be
 *   cached for good and `index.html` never; every page must carry the headers that stop an
 *   injected script, a frame or a sniffed file from turning the page against the local API;
 *   and no request path may read a file outside the build folder.
 *
 * Pins: content types; immutable cache for `/assets/*`, `no-store` for index.html; CSP (self
 *   only, frame-ancestors none, the inline theme script allowed by hash and nothing else),
 *   nosniff, no-referrer; SPA fallback for page paths and its absence for `/api/*`, for
 *   missing files with an extension and for non-navigation requests; API/page name collision;
 *   path traversal refused; HEAD has no body; a server without a UI answers as before.
 * Depends on: src/services/http/{static-ui,router}, helpers/http-rig, helpers/temp. IO: temp files, a loopback socket.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStaticUi, inlineScriptHashes } from '#/services/http/static-ui.js';
import { sendJson } from '#/services/http/respond.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { makeTempDir } from '#tests/helpers/temp.js';
import type { Route } from '#/types/http.types.js';

const THEME_SCRIPT =
  "try { document.documentElement.dataset.theme = 'dark'; } catch (e) {}";

const INDEX = `<!doctype html><html><head><script>${THEME_SCRIPT}</script></head><body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body></html>`;
const SECRET = 'outside-the-build-folder';

const routes: Route[] = [
  {
    method: 'GET',
    path: '/tickets/:id',
    handle: async ({ res, params }) => sendJson(res, 200, { ticket: params['id'] }),
  },
  {
    method: 'GET',
    path: '/health',
    access: 'open',
    handle: async ({ res }) => sendJson(res, 200, { service: 'forge' }),
  },
];

const html = { accept: 'text/html,application/xhtml+xml' };

let rig: HttpRig;
let bare: HttpRig;

beforeEach(async () => {
  const dir = makeTempDir('static-ui');
  const root = join(dir, 'web');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), INDEX);
  await writeFile(join(root, 'assets', 'index-abc123.js'), 'console.log(1)');
  await writeFile(join(root, 'assets', 'index-abc123.css'), 'body{margin:0}');
  await writeFile(join(root, 'assets', 'plex-400.woff2'), 'font');
  await writeFile(join(root, 'favicon.ico'), 'ico');
  await writeFile(join(root, 'android-chrome-192x192.png'), 'png');
  await writeFile(join(root, 'site.webmanifest'), '{"name":"Forge"}');
  await writeFile(join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(dir, 'secret.txt'), SECRET);

  rig = await startHttp(routes, undefined, { ui: createStaticUi(root) });
  bare = await startHttp(routes);
});

afterEach(async () => {
  await rig.close();
  await bare.close();
});

describe('files', () => {
  it.each([
    ['/assets/index-abc123.js', 'text/javascript; charset=utf-8'],
    ['/assets/index-abc123.css', 'text/css; charset=utf-8'],
    ['/assets/plex-400.woff2', 'font/woff2'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'image/x-icon'],
    ['/android-chrome-192x192.png', 'image/png'],
    ['/site.webmanifest', 'application/manifest+json; charset=utf-8'],
  ])('serves %s as %s', async (path, type) => {
    const res = await rig.raw('GET', path);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(type);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('caches hashed assets for good and everything else not at all', async () => {
    const asset = await rig.raw('GET', '/assets/index-abc123.js');
    const icon = await rig.raw('GET', '/favicon.svg');
    const index = await rig.raw('GET', '/');

    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(icon.headers['cache-control']).toBe('no-cache');
    expect(index.headers['cache-control']).toBe('no-store');
  });

  it('answers HEAD with the headers and no body', async () => {
    const res = await rig.raw('HEAD', '/assets/index-abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe('14');
    expect(res.text).toBe('');
  });

  it('does not give the app for a missing file with an extension', async () => {
    const res = await rig.raw('GET', '/assets/missing.js', html);

    expect(res.status).toBe(401);
    expect(res.text).not.toContain('<div id="root">');
  });
});

describe('index.html and its headers', () => {
  it('is served at / with a CSP that allows only self and the theme script hash', async () => {
    const res = await rig.raw('GET', '/', html);
    const csp = String(res.headers['content-security-policy']);
    const hash = `sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}`;

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.text).toBe(INDEX);
    expect(csp).toContain(`script-src 'self' '${hash}'`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('carries the framing, referrer and isolation headers', async () => {
    const res = await rig.raw('GET', '/');

    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('hashes every inline script and none with a src', () => {
    const hashes = inlineScriptHashes(INDEX);

    expect(hashes).toHaveLength(1);
  });
});

describe('page paths and the API', () => {
  it('gives a client-side route the app', async () => {
    const res = await rig.raw('GET', '/projects/forge/board', html);

    expect(res.status).toBe(200);
    expect(res.text).toBe(INDEX);
  });

  it('gives the app, not the API, to a browser opening a path the API also has', async () => {
    const page = await rig.raw('GET', '/tickets/FX-1', html);
    const call = await rig.raw('GET', '/tickets/FX-1', {
      authorization: `Bearer ${'t'.repeat(10)}`,
    });

    expect(page.status).toBe(200);
    expect(page.text).toBe(INDEX);
    expect(call.status).toBe(401);
    expect(call.headers['content-type']).toContain('application/json');
  });

  it('never gives the app for a path under /api', async () => {
    const unknown = await rig.raw('GET', '/api/nope', html);
    const route = await rig.raw('GET', '/api/tickets/FX-1', html);

    expect(unknown.text).not.toContain('<div id="root">');
    expect(route.text).not.toContain('<div id="root">');
    expect(route.status).toBe(401);
  });

  it('keeps /health a JSON answer for the CLI', async () => {
    const res = await rig.raw('GET', '/health');

    expect(JSON.parse(res.text)).toEqual({ service: 'forge' });
  });

  it('does not give the app to a request that is not a browser navigation', async () => {
    const res = await rig.raw('GET', '/projects/forge/board');

    expect(res.status).toBe(401);
  });
});

describe('the build folder boundary', () => {
  it.each([
    ['dot segments', '/../secret.txt'],
    ['encoded dot segments', '/%2e%2e/secret.txt'],
    ['an encoded slash climb', '/assets/..%2f..%2fsecret.txt'],
    ['backslashes', '/assets/..%5c..%5csecret.txt'],
    ['a drive colon', '/C:/Windows/win.ini'],
    ['a NUL byte', '/assets/index-abc123.js%00.png'],
  ])('refuses %s', async (_name, path) => {
    const res = await rig.raw('GET', path);

    expect(res.text).not.toContain(SECRET);
    expect(res.status).not.toBe(200);
  });
});

describe('a server with no UI built', () => {
  it('answers as an API alone', async () => {
    const res = await bare.raw('GET', '/', html);

    expect(res.status).toBe(401);
  });
});
