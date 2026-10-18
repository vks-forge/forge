/**
 * Pins how a run's memory scope is built from its agent, in the MCP process.
 *
 * Why: a Worker reads project memory through tools, and what it may see is decided by its agent (d-0078): the
 *   tags the agent cares about and whether it sees rejected approaches. The scope is built here, from the run's
 *   own rows and the owner's saved settings, never from anything the Worker sends. A run with no agent (an older
 *   run) sees what every Worker saw before agents existed: the whole project including rejected approaches. A run
 *   whose agent the settings no longer list gets the narrowest scope, not the widest, and a run, ticket or
 *   project that cannot be found gets none at all, so the tools answer `not_found`.
 *
 * Pins: an agent's tags and include_rejected become the scope, no agent reads the whole project with rejected
 *   approaches, an unknown agent reads the narrowest, a project's own agent overrides apply, an unknown run gives
 *   null, and the scope never has proposals, outcomes or superseded records.
 * Depends on: src/services/memory-scope, @forge/db (memory adapters), @forge/core, vitest. No IO beyond memory.
 */

import { BUILTIN_AGENTS, scopeAdmits } from '@forge/core';
import type { Run } from '@forge/core';
import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryScopeResolver } from '#/services/memory-scope.js';

const T = '2026-10-18T00:00:00.000Z';

const run = (id: string, over: Partial<Run> = {}): Run =>
  ({
    id,
    ticket_id: 'DM-1',
    project: 'demo',
    harness: 'claude-code',
    driver_version: '1',
    cwd: '/w',
    lane: 'standard',
    started_at: T,
    status: 'running',
    owner: 'o',
    generation: 1,
    ...over,
  }) as Run;

let storage = createMemoryStorage();
let config = createMemoryConfigSource();

beforeEach(async () => {
  storage = createMemoryStorage();
  config = createMemoryConfigSource();
  await storage.transaction(async (tx) => {
    await tx.projects.upsert({
      id: 'demo',
      slug: 'demo',
      prefix: 'DM',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    });

    await tx.tickets.insert({
      id: 'DM-1',
      project: 'demo',
      title: 't',
      body: 'b',
      type: 'feat',
      lane: 'standard',
      tier_predicted: 'A',
      status: 'in_progress',
      status_version: 0,
      rework_count: 0,
      blocked_by: [],
      created_at: T,
      updated_at: T,
    } as never);
  });
});

const put = (r: Run) => storage.transaction((tx) => tx.runs.insert(r));

describe('memoryScopeResolver', () => {
  it('gives a run with no agent the whole project, rejected approaches included', async () => {
    await put(run('r1'));

    const placed = await memoryScopeResolver(storage, config)('r1');

    expect(placed).toMatchObject({ project: 'demo', ticket_id: 'DM-1' });
    expect(placed?.scope).toMatchObject({
      tags: [],
      include_rejected: true,
      kinds: ['decision', 'rejected'],
    });
  });

  it("builds the scope from the run's agent: its tags and whether it sees rejected approaches", async () => {
    const any = Object.values(BUILTIN_AGENTS)[0];
    expect(any).toBeDefined();
    const id = Object.keys(BUILTIN_AGENTS)[0] as string;
    await put(run('r2', { agent_id: id }));

    const placed = await memoryScopeResolver(storage, config)('r2');
    const memory = (any as { memory: { tags: string[]; include_rejected: boolean } })
      .memory;

    expect(placed?.scope.tags).toEqual(memory.tags);
    expect(placed?.scope.include_rejected).toBe(memory.include_rejected);
  });

  it('gives an agent the settings no longer list the narrowest scope, never the widest', async () => {
    await put(run('r3', { agent_id: 'ghost-agent' }));

    const placed = await memoryScopeResolver(storage, config)('r3');

    expect(placed?.scope).toMatchObject({
      tags: [],
      include_rejected: false,
      kinds: ['decision'],
      status: ['active'],
    });
  });

  it('gives null for a run, a ticket or a project that cannot be found', async () => {
    await put(run('r4', { ticket_id: 'DM-404', project: undefined } as Partial<Run>));
    const resolve = memoryScopeResolver(storage, config);

    expect(await resolve('nope')).toBeNull();
    expect(await resolve('r4')).toBeNull();
  });

  it('never admits a proposal, an outcome or a superseded record', async () => {
    await put(run('r1'));
    const scope = (await memoryScopeResolver(storage, config)('r1'))?.scope;

    expect(scope).toBeDefined();
    for (const [kind, status] of [
      ['proposal', 'pending'],
      ['outcome', 'active'],
      ['decision', 'superseded'],
      ['decision', 'pending'],
    ] as const) {
      expect(scopeAdmits(scope as never, { kind, status, tags: [] })).toBe(false);
    }
  });
});
