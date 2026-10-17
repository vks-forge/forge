/**
 * Agent lifecycle on the company routes: reset, archive and unarchive.
 *
 * Why: agents are never deleted (runs name them), so what the owner can do to one is bounded: a
 *   built-in can be reset to what the release ships but not archived, a custom agent can be archived
 *   and brought back and stays listed, and the implementer, which every lane runs, can be neither
 *   archived nor switched off. Each refusal has its own code so the screen can say why.
 *
 * Pins: reset removes the stored edits; 409 not_overridden and not_builtin and 404; archive and
 *   unarchive of a custom agent keep it listed; 409 builtin_locked for every built-in (the implementer included).
 * Depends on: helpers/agent-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompanyOverride, ConfigVersion } from '@forge/core';
import { WHO, agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const at = (expected_version: number, extra: Record<string, unknown> = {}) => ({
  expected_version,
  ...WHO,
  ...extra,
});

const create = (over: Record<string, unknown> = {}, expected = 0) =>
  call('POST', '/settings/agents', {
    agent: agentBody(over),
    origin: 'custom',
    ...at(expected),
  });

/** The agents section of a stored company version. */
const agentsOf = (
  v: ConfigVersion | undefined,
): NonNullable<CompanyOverride['agents']> | undefined =>
  (v?.doc as CompanyOverride | undefined)?.agents;

const errorOf = (res: { body: unknown }): { code: string; issues?: unknown[] } =>
  (res.body as { error: { code: string; issues?: unknown[] } }).error;

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('reset, archive and unarchive', () => {
  const act = (path: string, expected: number) => call('POST', path, at(expected));

  it('reset removes the stored edits so the built-in is back to what the release ships', async () => {
    await call('PUT', '/settings/agents/critic', {
      agent: agentBody({
        name: 'Critic',
        role: 'reviewer',
        tools: ['read'],
        write_scope: [],
        instructions: 'x',
      }),
      ...at(0),
    });

    const res = await act('/settings/agents/critic/reset', 1);
    const [, v2] = await rig.config.history('company');

    expect(res.status).toBe(200);
    expect(agentsOf(v2)).toBeUndefined();
    expect(
      (res.body as { agents: { id: string; tags: string[] }[] }).agents.find(
        (a) => a.id === 'critic',
      )?.tags,
    ).toEqual(['builtin']);
  });

  it('answers 409 not_overridden for a built-in with no edits and not_builtin for a custom agent', async () => {
    expect(errorOf(await act('/settings/agents/critic/reset', 0)).code).toBe(
      'not_overridden',
    );

    await create();

    expect(errorOf(await act('/settings/agents/docs-helper/reset', 1)).code).toBe(
      'not_builtin',
    );

    expect((await act('/settings/agents/ghost/reset', 1)).status).toBe(404);
  });

  it('archives and unarchives a custom agent and keeps it listed', async () => {
    await create();

    const gone = await act('/settings/agents/docs-helper/archive', 1);
    const tags = (r: { body: unknown }) =>
      (r.body as { agents: { id: string; tags: string[] }[] }).agents.find(
        (a) => a.id === 'docs-helper',
      )?.tags;

    expect(tags(gone)).toEqual(['company', 'archived']);

    const back = await act('/settings/agents/docs-helper/unarchive', 2);

    expect(tags(back)).toEqual(['company']);
  });

  it('refuses to archive a built-in, the implementer included (builtin_locked)', async () => {
    const reviewer = await act('/settings/agents/reviewer/archive', 0);
    const implementer = await act('/settings/agents/implementer/archive', 0);

    expect([reviewer.status, errorOf(reviewer).code]).toEqual([409, 'builtin_locked']);
    expect([implementer.status, errorOf(implementer).code]).toEqual([
      409,
      'builtin_locked',
    ]);
  });
});
