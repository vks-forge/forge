/**
 * The pipeline save door for the Full lane's stages: writer groups, the Director check, the sign-off
 * and the critic's model family.
 *
 * Why: the editor can now compose parallel writers, a Director check and a sign-off, and the server is
 *   the floor under it. Two writers share one worktree, so a save whose write scopes can meet must be
 *   refused with the problem named; the Director's check judges finished work, so one placed before G1
 *   or a sign-off before a check must be refused; and a critic on the Worker's own model family is
 *   only a warning while one family is connected but a refusal once a second is (d-0073). Every
 *   refusal is a 400 `pipeline_invalid` with the problems and stores nothing.
 *
 * Pins: Full lane lists as live with the Director check and sign-off in its shipped list; a writer
 *   group with disjoint scopes is saved and one with overlapping scopes is a 400 `writer_scope_overlap`
 *   (nothing stored); a Director check before G1 and a sign-off before a check are 400s; the shipped
 *   Full list saves with one family connected (warning on the critic) and is a 400 `critic_same_family`
 *   with two; validate lists the same problem.
 * Depends on: helpers/agent-rig, helpers/pipeline-fixtures. IO: a loopback socket.
 */

import type { PipelineView } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';
import { agent, g1, merge, send } from '#tests/helpers/pipeline-fixtures.js';

let rig: AgentRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const call = (method: string, path: string, body?: unknown) =>
  (rig as AgentRig).http.json(method, path, body);

type Reply = { pipelines: Record<string, PipelineView>; version: number };
const errorOf = (r: { body: unknown }) =>
  (
    r.body as {
      error: { code: string; problems?: { code: string; stage_id?: string }[] };
    }
  ).error;

const dcheck = {
  id: 'check-plan',
  kind: 'director_check',
  label: 'Check against the plan',
};

const sign = {
  id: 'sign-off',
  kind: 'sign_off',
  label: 'Sign-off',
  signer: 'director_or_owner',
  prompt: 'Sign it off.',
};

const group = (a: string, b: string) => ({
  id: 'writers',
  kind: 'group',
  label: 'Writers',
  join: 'all',
  members: [agent('fe', a), agent('be', b)],
});

/** Creates a custom writer with one write scope; returns its id. */
async function writer(name: string, scope: string, version: number): Promise<string> {
  const res = await call('POST', '/settings/agents', {
    agent: agentBody({ name, write_scope: [scope] }),
    origin: 'custom',
    expected_version: version,
    reason: 'a writer',
  });

  return (res.body as { id: string }).id;
}

describe('the Full lane as shipped', () => {
  it('is live and carries the Director check and the sign-off', async () => {
    rig = await startAgentRig();
    const full = (await call('GET', '/settings/pipelines')).body as Reply;
    const lane = full.pipelines['full'];

    expect(lane?.live).toBe(true);
    expect(lane?.definition.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'review-group',
      'check-plan',
      'sign-off',
      'merge',
    ]);
  });
});

describe('writer groups', () => {
  it('saves a group of two writers with disjoint scopes before G1', async () => {
    rig = await startAgentRig();
    const fe = await writer('Frontend', 'apps/web/**', 0);
    const be = await writer('Backend', 'packages/**', 1);

    const res = await call(
      'PUT',
      '/settings/pipelines/full',
      send(2, {
        pipeline: {
          stages: [
            group(fe, be),
            g1(),
            agent('reviewer', 'reviewer'),
            dcheck,
            sign,
            merge(),
          ],
        },
      }),
    );

    expect(res.status).toBe(200);
    expect((res.body as Reply).pipelines['full']?.tags).toEqual(['edited']);
  });

  it('refuses overlapping write scopes with writer_scope_overlap and stores nothing', async () => {
    rig = await startAgentRig();
    const web = await writer('Web', 'apps/**', 0);
    const ui = await writer('Ui', 'apps/web/**', 1);
    const before = (await (rig as AgentRig).config.history('company')).length;

    const res = await call(
      'PUT',
      '/settings/pipelines/full',
      send(2, {
        pipeline: {
          stages: [group(web, ui), g1(), agent('reviewer', 'reviewer'), merge()],
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('pipeline_invalid');
    expect(errorOf(res).problems?.map((p) => p.code)).toContain('writer_scope_overlap');
    expect((await (rig as AgentRig).config.history('company')).length).toBe(before);
  });
});

describe('the Director check and the sign-off', () => {
  const stages = (...rest: Record<string, unknown>[]) => ({
    stages: [agent('implementer', 'implementer'), ...rest],
  });

  it('refuses a Director check before G1 and a sign-off before a check', async () => {
    rig = await startAgentRig();
    const early = await call(
      'PUT',
      '/settings/pipelines/full',
      send(0, { pipeline: stages(dcheck, g1(), merge()) }),
    );

    expect(errorOf(early).problems?.map((p) => p.code)).toContain(
      'director_check_position',
    );

    const signed = await call(
      'PUT',
      '/settings/pipelines/full',
      send(0, { pipeline: stages(g1(), sign, agent('reviewer', 'reviewer'), merge()) }),
    );

    expect(errorOf(signed).problems?.map((p) => p.code)).toContain('sign_off_position');
  });
});

describe('the critic model family', () => {
  it('saves the shipped Full list with one family connected and warns about the critic', async () => {
    rig = await startAgentRig();
    const full = ((await call('GET', '/settings/pipelines')).body as Reply).pipelines[
      'full'
    ];

    const res = await call('POST', '/settings/pipelines/validate', {
      lane: 'full',
      pipeline: full?.definition,
    });

    const body = res.body as { problems: { code: string }[]; warnings: string[] };

    expect(body.problems).toEqual([]);
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it('refuses the same list once a second family is connected', async () => {
    rig = await startAgentRig({ second: true });
    const full = ((await call('GET', '/settings/pipelines')).body as Reply).pipelines[
      'full'
    ];

    const validate = await call('POST', '/settings/pipelines/validate', {
      lane: 'full',
      pipeline: full?.definition,
    });

    expect(
      (validate.body as { problems: { code: string }[] }).problems.map((p) => p.code),
    ).toContain('critic_same_family');

    const save = await call(
      'PUT',
      '/settings/pipelines/full',
      send(0, {
        pipeline: {
          ...full?.definition,
          stages: [...(full?.definition.stages ?? [])].map((s) =>
            s.kind === 'merge' ? s : { ...s },
          ),
          description: 'edited',
        },
      }),
    );

    expect(save.status).toBe(400);
    expect(errorOf(save).problems?.map((p) => p.code)).toContain('critic_same_family');
  });
});
