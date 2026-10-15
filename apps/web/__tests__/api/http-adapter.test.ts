/**
 * Pins: the http adapter parses `GET /projects` with the schema derived from `@forge/core`,
 * rejects payloads that do not match, and turns refusals and dead connections into typed
 * ApiErrors a screen can tell apart.
 *
 * Why: the project switcher is the first thing the UI needs from Forge. A server and UI that
 *   disagree must fail at the boundary with a named field, and "Forge is down" must look
 *   different from "Forge said no" so each gets its own message and fix.
 * Depends on: src/api/http/http-adapter, src/api/api-error, src/api/describe-error. No IO (fetch is a fake).
 */

import { describe, expect, it, vi } from 'vitest';
import { ApiError, errorFamilyOfStatus } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { createHttpAdapter } from '#/api/http/http-adapter.js';

const row = {
  id: 'p1',
  slug: 'alpha',
  prefix: 'ALP',
  status: 'ready',
  ecosystems: ['node'],
  local_path: 'C:\\work\\alpha',
};

const adapterFor = (fetch: typeof globalThis.fetch) =>
  createHttpAdapter({ baseUrl: '/api', fetch }).projects;

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }

  throw new Error('expected the call to fail');
}

describe('http adapter: projects', () => {
  it('returns the parsed projects and sends no credentials', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ projects: [row, { ...row, id: 'p2', slug: 'beta' }] }),
      );

    const projects = await adapterFor(fetch)!.list();

    expect(projects.map((p) => p.slug)).toEqual(['alpha', 'beta']);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/projects');
    expect(init.method).toBe('GET');
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('authorization');
  });

  it('keeps the server note that a project settings document is broken', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ projects: [{ ...row, config_error: 'bad glob' }] }),
      );

    const [project] = await adapterFor(fetch)!.list();

    expect(project?.config_error).toBe('bad glob');
  });

  it('rejects a payload that does not match the schema and names the field', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ projects: [{ ...row, slug: 'Not A Slug' }] }));

    const error = await failureOf(adapterFor(fetch)!.list());

    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('payload');
    expect(error.message).toContain('projects.0.slug');
  });

  it('rejects a body that is not JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>oops</html>'));

    expect((await failureOf(adapterFor(fetch)!.list())).kind).toBe('payload');
  });

  it('turns a server refusal into an http error with the server code and message', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'unauthorized', message: 'unauthorized' } },
          { status: 401 },
        ),
      );

    const error = await failureOf(adapterFor(fetch)!.list());

    expect(error).toMatchObject({ kind: 'http', status: 401, code: 'unauthorized' });
    expect(error.errorFamily).toBe('auth');
  });

  it('copes with an error body of unknown shape', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));

    const error = await failureOf(adapterFor(fetch)!.list());

    expect(error).toMatchObject({ kind: 'http', status: 500, code: 'http_error' });
    expect(error.errorFamily).toBe('unknown');
  });

  it('turns a dead connection into a network error', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    expect((await failureOf(adapterFor(fetch)!.list())).kind).toBe('network');
  });

  it('lets an aborted request surface as an abort, not an error state', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(adapterFor(fetch)!.list()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('error wording', () => {
  it('maps statuses to the closed error families', () => {
    expect(errorFamilyOfStatus(401)).toBe('auth');
    expect(errorFamilyOfStatus(403)).toBe('auth');
    expect(errorFamilyOfStatus(429)).toBe('rate_limit');
    expect(errorFamilyOfStatus(404)).toBe('invalid_input');
    expect(errorFamilyOfStatus(502)).toBe('unknown');
  });

  it('gives each failure its own next step', () => {
    expect(describeError(new ApiError('network', 'x')).title).toBe('Cannot reach Forge');
    expect(describeError(new ApiError('http', 'x', { status: 401 })).title).toMatch(
      /session/,
    );

    expect(describeError(new ApiError('payload', 'x')).title).toMatch(/cannot read/);
    expect(describeError(new ApiError('http', 'disk full', { status: 500 })).detail).toBe(
      'disk full',
    );

    expect(describeError(new Error('?')).title).toBe('Something went wrong');
  });
});
