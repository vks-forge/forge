/**
 * The Director draft route: `POST /agents/draft`.
 *
 * Why: most owners know what they want an agent to do, not how to write it. The Director drafts a
 *   definition from a description, told what is really available here. A draft is untrusted model
 *   output: one that breaks a role bound must be refused with every rule listed and nothing written,
 *   a good one is returned and still not saved (only the owner pressing Save saves it), and a stalled
 *   Director is a clear 504, not a hang.
 *
 * Pins: happy path writes nothing; the step input (tools per role, ready harnesses, taken names);
 *   422 draft_invalid for a write tool or an unknown tool; 504 step_timeout; 400 and 404 for the
 *   description and project; 503 without ports.
 * Depends on: helpers/agent-rig, helpers/scripted-llm. IO: a loopback socket.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig | undefined;

const start = async (
  opts: Parameters<typeof startAgentRig>[0] = {},
): Promise<AgentRig> => {
  rig = await startAgentRig(opts);

  return rig;
};

const call = (r: AgentRig, method: string, path: string, body?: unknown) =>
  r.http.json(method, path, body);

const errorOf = (r: {
  body: unknown;
}): { code: string; issues?: { path: string; message: string }[] } =>
  (r.body as { error: { code: string; issues?: { path: string; message: string }[] } })
    .error;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

describe('POST /agents/draft', () => {
  const ask = (r: AgentRig, over: Record<string, unknown> = {}) =>
    call(r, 'POST', '/agents/draft', {
      description: 'A read-only agent that checks API changes for breaking changes.',
      scope: 'company',
      ...over,
    });

  it('returns the Director draft and writes nothing', async () => {
    const r = await start();
    const res = await ask(r);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      definition: { name: 'Drafted', role: 'reviewer' },
      rationale: 'A scripted draft.',
      questions: [],
    });

    expect((await r.config.history('company')).length).toBe(0);
  });

  it('tells the Director what is available: tools per role, ready harnesses with models, taken names', async () => {
    const r = await start();
    await ask(r);
    const input = r.director.calls.find((c) => c.name === 'draft_agent')?.input as {
      allowed_tools: { reviewer: string[]; writer: string[] };
      harnesses: { id: string; models: { id: string }[] }[];
      existing_names: string[];
    };

    expect(input.allowed_tools.writer).toContain('edit');
    expect(input.allowed_tools.reviewer).not.toContain('edit');
    expect(input.allowed_tools.reviewer).toContain('read');
    expect(input.harnesses[0]).toMatchObject({ id: 'claude-code' });
    expect(input.existing_names).toContain('Reviewer');
  });

  it('refuses a draft with a reviewer holding edit with 422 draft_invalid and lists the rule', async () => {
    const bad = {
      definition: agentBody({
        role: 'reviewer',
        tools: ['read', 'edit'],
        write_scope: [],
      }),
      rationale: 'x',
      questions: [],
    };

    const r = await start({ draft: bad });
    const res = await ask(r);

    expect(res.status).toBe(422);
    expect(errorOf(res).code).toBe('draft_invalid');
    expect(JSON.stringify(errorOf(res).issues)).toContain('edit');
    expect((await r.config.history('company')).length).toBe(0);
  });

  it('refuses a draft naming a tool the catalogue does not have', async () => {
    const bad = {
      definition: agentBody({
        role: 'reviewer',
        tools: ['read', 'teleport'],
        write_scope: [],
      }),
      rationale: 'x',
      questions: [],
    };

    const r = await start({ draft: bad });
    const res = await ask(r);

    expect(res.status).toBe(422);
    expect(JSON.stringify(errorOf(res).issues)).toContain('teleport');
  });

  it('answers 504 step_timeout when the Director stalls', async () => {
    const r = await start();
    r.director.llm.step = async () => ({
      ok: false,
      error: { kind: 'stall', message: 'late' },
    });

    const res = await ask(r);

    expect(res.status).toBe(504);
    expect(errorOf(res).code).toBe('step_timeout');
  });

  it('validates the description length and the project for a project scope', async () => {
    const r = await start();

    expect((await ask(r, { description: 'too short' })).status).toBe(400);
    expect(errorOf(await ask(r, { scope: 'project' })).code).toBe('project_required');
    expect((await ask(r, { scope: 'project', project: 'ghost' })).status).toBe(404);
  });

  it('answers 503 not_available on a server with no Director model wired', async () => {
    const r = await start({ ports: false });

    expect((await ask(r)).status).toBe(503);
  });
});
