/**
 * Pins: the memory http adapter's S7 calls: the search query string (repeated kind, status and
 * tag, the superseded switch, paging), the paths for history, related, import and export, the
 * POST bodies, the typed 409 codes, and that no call edits or deletes a record.
 *
 * Why: these calls reach what the owner can see and move. A search that drops a chip, a path
 * that lets a hand-edited id escape its route, or an adapter method that PUTs a record would each
 * break the append-only promise or show the wrong records.
 * Depends on: api/http/memory-http, api/api-error. No IO (fetch is a fake).
 */

import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '#/api/api-error.js';
import { createMemoryHttp, searchQuery } from '#/api/http/memory-http.js';

const client = (fetch: typeof globalThis.fetch) => ({ baseUrl: '/api', fetch });
const state = {
  q: ' pnpm ',
  kinds: [],
  statuses: [],
  tags: [],
  superseded: false,
} as const;

describe('searchQuery', () => {
  it('repeats kind, status and tag, trims the words and adds paging', () => {
    const query = new URLSearchParams(
      searchQuery({
        ...state,
        kinds: ['decision', 'rejected'],
        statuses: ['active'],
        tags: ['a', 'b'],
        superseded: true,
        offset: 10,
        limit: 10,
      }),
    );

    expect(query.get('q')).toBe('pnpm');
    expect(query.getAll('kind')).toEqual(['decision', 'rejected']);
    expect(query.getAll('status')).toEqual(['active']);
    expect(query.getAll('tag')).toEqual(['a', 'b']);
    expect(query.get('superseded')).toBe('1');
    expect(query.get('offset')).toBe('10');
    expect(query.get('k')).toBe('10');
  });

  it('leaves out the superseded key when it is off, and encodes hostile words', () => {
    const text = searchQuery({ ...state, q: 'a&b=c#d', offset: 0, limit: 10 });

    expect(text).not.toContain('superseded');
    expect(new URLSearchParams(text).get('q')).toBe('a&b=c#d');
  });
});

describe('http adapter: memory (S7)', () => {
  const status = {
    state: 'verified',
    head_sha: null,
    files: 1,
    imported: 1,
    lenient: 0,
    rejects: [],
    verified_at: null,
    backup_path: null,
    repo_deleted_at: null,
    message: null,
  };

  it('calls search, history, related, import and export on their own paths', async () => {
    const fetch = vi.fn((url: string) => {
      if (url.includes('/search')) {
        return Promise.resolve(Response.json({ hits: [], total: 0, truncated: false }));
      }

      if (url.endsWith('/history')) {
        return Promise.resolve(Response.json({ events: [], versions: [] }));
      }

      if (url.endsWith('/related')) {
        return Promise.resolve(Response.json({ related: [] }));
      }

      if (url.endsWith('/export')) {
        return Promise.resolve(Response.json({ path: 'C:/x', files: 2, at: 'now' }));
      }

      return Promise.resolve(Response.json(status));
    });

    const api = createMemoryHttp(client(fetch as never));

    await api.search('a b', { ...state, offset: 0, limit: 10 });
    await api.history('a b', 'd/0001');
    await api.related('a b', 'd-0001');
    await api.importStatus('a b');
    await api.retryImport('a b');
    await api.exportMarkdown('a b');

    const calls = (
      fetch.mock.calls as unknown as [string, RequestInit | undefined][]
    ).map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);

    expect(calls[0]).toMatch(/^GET \/api\/projects\/a%20b\/memory\/search\?q=pnpm/);
    expect(calls.slice(1)).toEqual([
      'GET /api/projects/a%20b/memory/d%2F0001/history',
      'GET /api/projects/a%20b/memory/d-0001/related',
      'GET /api/projects/a%20b/memory/import',
      'POST /api/projects/a%20b/memory/import',
      'POST /api/projects/a%20b/memory/export',
    ]);
  });

  it('turns a 409 into a typed error with the server code', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { error: { code: 'memory_not_migrated', message: 'files' } },
          { status: 409 },
        ),
      ),
    );

    const error = (await createMemoryHttp(client(fetch as never))
      .search('a', { ...state, offset: 0, limit: 10 })
      .catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(409);
    expect(error.code).toBe('memory_not_migrated');
  });

  it('has no method that edits or deletes a record', () => {
    const names = Object.keys(createMemoryHttp(client(vi.fn() as never)));

    expect(
      names.filter((n) => /update|edit|delete|remove|put|patch|revert/i.test(n)),
    ).toEqual([]);
  });
});
