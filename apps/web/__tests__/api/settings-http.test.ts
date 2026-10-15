/**
 * Pins: the settings http adapter calls the exact server routes with the right method and body,
 * never expects a credential back, and turns a 409 into an ApiError a screen can recognise.
 *
 * Why: these calls store credentials and change caps. A wrong path or method would write
 *   nothing and say nothing, and a screen that cannot tell a version conflict from any other
 *   failure cannot offer the reload path. The fetch is a fake, so no server is needed.
 * Depends on: src/api/http/http-adapter, src/api/api-error. No IO (fetch is a fake).
 */

import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '#/api/api-error.js';
import { createHttpAdapter } from '#/api/http/http-adapter.js';

const call = (fetch: ReturnType<typeof vi.fn>, n = 0) => {
  const [url, init] = fetch.mock.calls[n] as [string, RequestInit];

  return { url, method: init.method, body: init.body as string | undefined };
};

const adapter = (fetch: ReturnType<typeof vi.fn>) =>
  createHttpAdapter({
    baseUrl: '/api',
    fetch: fetch as unknown as typeof globalThis.fetch,
  });

describe('http adapter: harnesses', () => {
  it('stores a secret with PUT and accepts an answer that holds no secret', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 'claude', kind: 'api_key', stored: true }));

    const result = await adapter(fetch).harnesses!.putSecret('claude', {
      kind: 'api_key',
      value: 'sk-test',
    });

    expect(call(fetch)).toMatchObject({
      url: '/api/harnesses/claude/secret',
      method: 'PUT',
      body: JSON.stringify({ kind: 'api_key', value: 'sk-test' }),
    });

    expect(result).toEqual({ id: 'claude', kind: 'api_key', stored: true });
  });

  it('asks for the paid probe only when told to', async () => {
    const body = { auth_mode: 'login', ok: true, live: 'skipped' };
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(body)));

    await adapter(fetch).harnesses!.test('claude', false);
    await adapter(fetch).harnesses!.test('claude', true);

    expect(call(fetch, 0).url).toBe('/api/harnesses/claude/test');
    expect(call(fetch, 1).url).toBe('/api/harnesses/claude/test?live=1');
    expect(call(fetch, 1).method).toBe('POST');
  });

  it('posts tool decisions to approve and deny', async () => {
    const row = {
      harness_kind: 'claude',
      version: '1',
      tool: 'shell',
      schema_hash: `sha256:${'a'.repeat(64)}`,
      status: 'approved',
    };

    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(row)));

    await adapter(fetch).harnesses!.decideTool('claude', 'shell', 'approve', {
      author: 'a',
      reason: 'r',
    });

    expect(call(fetch).url).toBe('/api/harnesses/claude/tools/shell/approve');
    expect(call(fetch).body).toBe(JSON.stringify({ author: 'a', reason: 'r' }));
  });
});

describe('http adapter: company settings', () => {
  it('sends the version the editor saw and reports a conflict as 409', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'version_conflict', message: 'at version 4, not 3' } },
          { status: 409 },
        ),
      );

    const failure = await adapter(fetch)
      .settings!.saveCompany({ doc: {}, author: 'a', reason: 'r', expectedVersion: 3 })
      .catch((error: unknown) => error as ApiError);

    expect(call(fetch)).toMatchObject({ url: '/api/settings/company', method: 'PUT' });
    expect(JSON.parse(call(fetch).body ?? '{}')).toMatchObject({ expectedVersion: 3 });
    expect(failure).toMatchObject({
      kind: 'http',
      status: 409,
      code: 'version_conflict',
    });
  });
});

describe('http adapter: github', () => {
  it('lists connections without any key field', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        connections: [
          {
            id: 'acme',
            account: 'acme',
            app_id: '1',
            key_secret_name: 'github/acme/key',
            status: 'active',
            created_at: '2026-09-20T10:00:00.000Z',
          },
        ],
      }),
    );

    const list = await adapter(fetch).github!.list();

    expect(list.map((c) => c.id)).toEqual(['acme']);
    expect(JSON.stringify(list)).not.toContain('BEGIN');
  });
});
