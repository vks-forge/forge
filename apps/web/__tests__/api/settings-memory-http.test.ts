/**
 * Pins: the http adapter for project settings and memory: which endpoints it calls, what it
 * sends (the saved version, the author, the reason), how it turns a 409 into a typed error
 * and a malformed answer into a payload error.
 *
 * Why: these calls change what the Director plans against. The version the editor looked at
 * must reach the server (or a save could overwrite a newer one), a rejection must carry its
 * reason (the server refuses an empty one), and a server that disagrees with the UI must
 * fail at the boundary with a named field.
 * Depends on: api/http/{project-settings,memory}-http, api/api-error. No IO (fetch is a fake).
 */

import { BUILTIN_CONFIG } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '#/api/api-error.js';
import { createMemoryHttp } from '#/api/http/memory-http.js';
import { createProjectSettingsHttp } from '#/api/http/project-settings-http.js';

const client = (fetch: typeof globalThis.fetch) => ({ baseUrl: '/api', fetch });

const version = (n: number, doc: Record<string, unknown>) => ({
  id: n,
  scope: 'project',
  project: 'alpha',
  version: n,
  doc,
  author: 'owner',
  reason: 'r',
  created_at: 1_760_000_000_000,
});

describe('http adapter: project settings', () => {
  it('reads settings, history and company together and derives the override from the current version', async () => {
    const fetch = vi.fn((url: string) => {
      if (url.endsWith('/settings/projects/alpha')) {
        return Promise.resolve(
          Response.json({ config: BUILTIN_CONFIG, version: { company: 1, project: 2 } }),
        );
      }

      if (url.endsWith('/history')) {
        return Promise.resolve(
          Response.json({
            versions: [version(1, { remote: 'x' }), version(2, { remote: 'origin' })],
          }),
        );
      }

      return Promise.resolve(Response.json({ config: BUILTIN_CONFIG.forge, version: 1 }));
    });

    const snapshot = await createProjectSettingsHttp(client(fetch as never)).get('alpha');

    expect(snapshot.override).toEqual({ remote: 'origin' });
    expect(snapshot.versions).toHaveLength(2);
    expect(snapshot.company.engine.max_concurrent_per_project).toBe(1);
    expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([
      '/api/settings/company',
      '/api/settings/projects/alpha',
      '/api/settings/projects/alpha/history',
    ]);
  });

  it('saves with PUT, the owner as author and the version the editor looked at', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(version(3, { remote: 'o' })));

    await createProjectSettingsHttp(client(fetch)).save({
      slug: 'alpha',
      doc: { remote: 'o' },
      reason: 'because',
      expectedVersion: 2,
    });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/settings/projects/alpha');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      doc: { remote: 'o' },
      author: 'owner',
      reason: 'because',
      expectedVersion: 2,
    });
  });

  it('turns the server 409 into an ApiError with its code', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'version_conflict', message: 'at 3, not 2' } },
          { status: 409 },
        ),
      );

    const error = (await createProjectSettingsHttp(client(fetch))
      .save({ slug: 'alpha', doc: {}, reason: 'r', expectedVersion: 2 })
      .catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(409);
    expect(error.code).toBe('version_conflict');
  });

  it('archives with PATCH and returns the archived project', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        project: {
          id: 'p',
          slug: 'alpha',
          prefix: 'ALP',
          status: 'archived',
          ecosystems: [],
        },
      }),
    );

    const project = await createProjectSettingsHttp(client(fetch)).archive('alpha');

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual([
      '/api/projects/alpha',
      'PATCH',
      '{"status":"archived"}',
    ]);

    expect(project.status).toBe('archived');
  });
});

describe('http adapter: memory', () => {
  it('lists records and fails on an entry that does not match the schema', async () => {
    const good = vi.fn().mockResolvedValue(
      Response.json({
        records: [
          { id: 'd-0001', kind: 'decision', status: 'active', statement: 's', tags: [] },
        ],
      }),
    );

    const bad = vi.fn().mockResolvedValue(Response.json({ records: [{ id: 'nope' }] }));

    expect(await createMemoryHttp(client(good)).list('alpha')).toHaveLength(1);
    expect(good.mock.calls[0]?.[0]).toBe('/api/projects/alpha/memory');
    await expect(createMemoryHttp(client(bad)).list('alpha')).rejects.toMatchObject({
      kind: 'payload',
    });
  });

  it('approves and rejects with the owner as author, and the reason for a rejection', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ record: null, commit: 'abc' })),
      );

    const memory = createMemoryHttp(client(fetch));

    await memory.answer('alpha', { id: 'x-0001', verdict: 'approve' });
    await memory.answer('alpha', {
      id: 'x-0002',
      verdict: 'reject',
      reason: 'too broad',
    });

    const [approve, reject] = fetch.mock.calls as [string, RequestInit][];
    expect(approve?.[0]).toBe('/api/projects/alpha/memory/proposals/x-0001/approve');
    expect(JSON.parse(approve?.[1].body as string)).toEqual({ author: 'owner' });
    expect(reject?.[0]).toBe('/api/projects/alpha/memory/proposals/x-0002/reject');
    expect(JSON.parse(reject?.[1].body as string)).toEqual({
      author: 'owner',
      reason: 'too broad',
    });
  });
});
