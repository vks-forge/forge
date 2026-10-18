/**
 * Research settings routes: saving the provider, the Director's research limits and the Test provider button.
 *
 * Why: where Forge searches, which hosts it may fetch and how much one card may research are settings the owner
 *   edits in the UI and the database stores (code.md rule 9, d-0085); a bad value must be refused when saved,
 *   not found when a Worker or the Director first tries. The Test button must answer in a typed reply the page
 *   can phrase in plain words, for the saved settings or for values not yet saved, and must write nothing. After
 *   a company save the live provider is refreshed so the next research run follows the change without a restart.
 *
 * Pins: saving and reading `research`, `director.research` and a flow with one research step; a bad URL, an
 *   out-of-range cap and a second research step are 400; a project may narrow research and 404s for an unknown
 *   project; the test route for saved and unsaved settings, a body that is not a settings object, and 503 when
 *   there is no research port; refresh is called after a company save only.
 * Depends on: helpers/card-rig, @forge/db (memory config), @forge/core, vitest. IO: a loopback socket.
 */

import { BUILTIN_DIRECTOR_CONFIG } from '@forge/core';
import { createMemoryConfigSource } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCardRig } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;
const test = vi.fn();
const refresh = vi.fn(async () => undefined);

const put = (path: string, doc: Record<string, unknown>, expectedVersion = 0) =>
  ctx.rig.json('PUT', path, { doc, author: 'owner', reason: 'test', expectedVersion });

const company = async () =>
  (await ctx.rig.json('GET', '/settings/company')).body as {
    version: number;
    config: {
      research: Record<string, unknown>;
      director: { research: Record<string, unknown>; flow: { kind: string }[] };
    };
  };

beforeEach(async () => {
  test.mockReset();
  refresh.mockClear();
  ctx = await startCardRig(
    {},
    { config: createMemoryConfigSource(), research: { test, refresh } },
  );
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('saving research settings', () => {
  it('stores the provider, host lists, limits and refreshes the live provider', async () => {
    const res = await put('/settings/company', {
      research: {
        provider: 'searxng',
        searxng: { base_url: 'http://localhost:9999', allow_hosts: [] },
        fetch: {
          allow_hosts: ['docs.example.com'],
          deny_hosts: ['bad.example.com'],
          timeout_ms: 5000,
        },
      },
      director: { research: { max_rounds: 3, max_searches: 10, step_budget_usd: 0.5 } },
    });

    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);

    const saved = await company();
    expect(saved.config.research).toMatchObject({
      provider: 'searxng',
      searxng: { base_url: 'http://localhost:9999' },
      fetch: {
        allow_hosts: ['docs.example.com'],
        deny_hosts: ['bad.example.com'],
        timeout_ms: 5000,
      },
    });

    expect(saved.config.director.research).toMatchObject({
      max_rounds: 3,
      max_searches: 10,
      max_fetches: 8,
      step_budget_usd: 0.5,
    });
  });

  it('ships research defaults: SearXNG on localhost, 2 rounds, 6 searches, 8 fetches, 4 runs, detours on', async () => {
    const saved = await company();

    expect(saved.config.research).toMatchObject({
      provider: 'searxng',
      searxng: { base_url: 'http://localhost:8888' },
    });

    expect(saved.config.director.research).toEqual({
      max_rounds: 2,
      max_searches: 6,
      max_fetches: 8,
      max_bytes: 600_000,
      max_runs_per_card: 4,
      grill_detours: true,
    });

    expect(saved.config.director.flow.filter((s) => s.kind === 'research')).toHaveLength(
      1,
    );
  });

  it.each([
    [
      'a base URL that is not a URL',
      { research: { searxng: { base_url: 'not a url' } } },
    ],
    ['an unknown provider', { research: { provider: 'carrier-pigeon' } }],
    ['a timeout past 30 seconds', { research: { fetch: { timeout_ms: 60_000 } } }],
    ['more than 3 rounds', { director: { research: { max_rounds: 4 } } }],
    ['bytes under 50 000', { director: { research: { max_bytes: 100 } } }],
    ['a second research step', secondResearchStep()],
  ])('refuses %s with a 400', async (_name, doc) => {
    const res = await put('/settings/company', doc);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('lets a project narrow research and refuses an unknown project', async () => {
    const ok = await put('/settings/projects/fixture', {
      research: {
        enabled: false,
        deny_hosts: ['x.example.com'],
        allow_hosts: ['docs.example.com'],
      },
    });

    expect(ok.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();

    const read = (await ctx.rig.json('GET', '/settings/projects/fixture')).body as {
      config: { project: { research: unknown } };
    };

    expect(read.config.project.research).toEqual({
      enabled: false,
      deny_hosts: ['x.example.com'],
      allow_hosts: ['docs.example.com'],
    });

    expect(
      (await put('/settings/projects/ghost', { research: { enabled: false } })).status,
    ).toBe(404);

    expect(
      (await put('/settings/projects/other', { research: { enabled: 'nope' } })).status,
    ).toBe(400);
  });
});

function secondResearchStep() {
  const flow = structuredClone(BUILTIN_DIRECTOR_CONFIG.flow);
  const at = flow.findIndex((s) => s.kind === 'research');
  flow.splice(at, 0, { ...flow[at]!, id: 'research2' });

  return { director: { flow } };
}

describe('POST /settings/research/test', () => {
  const reply = { ok: true, provider: 'searxng', latency_ms: 12 };

  it('tests the saved settings with an empty body and unsaved settings when given', async () => {
    test.mockResolvedValue(reply);

    const saved = await ctx.rig.json('POST', '/settings/research/test', {});
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(reply);
    expect(test).toHaveBeenLastCalledWith(undefined);

    const unsaved = {
      provider: 'searxng',
      searxng: { base_url: 'http://localhost:7777', allow_hosts: [] },
      fetch: { allow_hosts: [], deny_hosts: [], timeout_ms: 4000 },
    };

    await ctx.rig.json('POST', '/settings/research/test', { research: unsaved });
    expect(test).toHaveBeenLastCalledWith(unsaved);
    expect((await company()).version).toBe(0);
  });

  it('passes a failure through for the page to explain', async () => {
    test.mockResolvedValue({
      ok: false,
      provider: 'searxng',
      error: {
        kind: 'unreachable',
        message: 'could not reach the server (fetch failed)',
      },
    });

    const res = await ctx.rig.json('POST', '/settings/research/test', {});

    expect(res.body).toMatchObject({ ok: false, error: { kind: 'unreachable' } });
  });

  it('refuses settings that are not settings with a 400 and never calls the provider', async () => {
    const res = await ctx.rig.json('POST', '/settings/research/test', {
      research: { provider: 'searxng' },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
    expect(test).not.toHaveBeenCalled();
  });

  it('answers 503 when this server has no research port', async () => {
    await ctx.rig.close();
    ctx = await startCardRig({}, { config: createMemoryConfigSource() });

    const res = await ctx.rig.json('POST', '/settings/research/test', {});

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'not_available' } });
  });
});
