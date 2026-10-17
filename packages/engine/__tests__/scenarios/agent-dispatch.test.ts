/**
 * Scenario: a run is started by the agent behind its ticket.
 *
 * Why: an owner who edits the implementer (adds instructions, picks a model, caps the budget,
 *   lists a fallback harness) expects the very next run to obey, and expects the run record to
 *   say which agent definition it used. These cases change one thing at a time on top of the
 *   built-in implementer and read back what the harness was asked: the prompt sections and their
 *   order, the model (or none), the budget keys, the fallback harness and its model, the memory
 *   view, and the agent id and hash on the run row.
 *
 * Pins: project override instructions appear as "## Agent instructions" between the brief and
 *   the rules; the run row names agent and hash; harness default sends no model; a named model
 *   and budget keys reach the request; an agent fallback list replaces the company list on
 *   quota; the agent's memory filter reaches the memory source; an archived stage agent parks the
 *   ticket instead of running another agent (fail closed).
 * Depends on: helpers/rig, helpers/scheduling-rig, @forge/core, vitest.
 */

import { BUILTIN_AGENTS, agentHash } from '@forge/core';
import type { AgentDefinition, CompanyOverride } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { HOUR, addProject, quotaResult } from '#tests/helpers/scheduling-rig.js';

const shipped = BUILTIN_AGENTS['implementer'] as AgentDefinition;

async function editCompany(
  rig: Rig,
  agents: NonNullable<CompanyOverride['agents']>,
): Promise<void> {
  const version = (await rig.config.company()).version;
  await rig.config.append({
    scope: 'company',
    doc: { agents },
    author: 'test',
    reason: 'edit the implementer',
    expectedVersion: version,
  });
}

async function dispatch(rig: Rig): Promise<void> {
  await rig.request('Fix the doctor check');
  await rig.tick();
}

describe('agent behind a run', () => {
  it('adds a project override of the instructions between the brief and the rules', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: {
        agents: { overrides: { implementer: { instructions: 'House style: tabs.' } } },
      },
      author: 'test',
      reason: 'house style',
      expectedVersion: 0,
    });

    await dispatch(rig);

    const prompt = rig.driver.starts[0]?.prompt ?? '';
    const brief = prompt.indexOf('Do the ticket.');
    const section = prompt.indexOf('## Agent instructions\nHouse style: tabs.');
    const rules = prompt.indexOf('## Rules of this run');

    expect(brief).toBe(0);
    expect(section).toBeGreaterThan(brief);
    expect(rules).toBeGreaterThan(section);
  });

  it('records the agent id and the hash of its effective definition on the run', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: {
        agents: { overrides: { implementer: { instructions: 'House style: tabs.' } } },
      },
      author: 'test',
      reason: 'house style',
      expectedVersion: 0,
    });

    await dispatch(rig);

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    const effective = { ...shipped, instructions: 'House style: tabs.' };

    expect(run?.agent_id).toBe('implementer');
    expect(run?.agent_hash).toBe(agentHash(effective));
    expect(run?.agent_hash).not.toBe(agentHash(shipped));
  });

  it('sends no model when the agent follows the harness default', async () => {
    const rig = await makeRig();
    await editCompany(rig, {
      implementer: { runs_on: { model: { kind: 'harness_default' } } },
    });

    await dispatch(rig);

    const req = rig.driver.starts[0];

    expect(req).toBeDefined();
    expect('model' in (req ?? {})).toBe(false);
  });

  it('sends a named or custom model id as written', async () => {
    const rig = await makeRig();
    await editCompany(rig, {
      implementer: { runs_on: { model: { kind: 'model', id: 'my-custom-model-7' } } },
    });

    await dispatch(rig);

    expect(rig.driver.starts[0]?.model).toBe('my-custom-model-7');
  });

  it('takes the agent budget keys it sets and the company run budget for the rest', async () => {
    const rig = await makeRig();
    await editCompany(rig, { implementer: { budget: { usd: 1.5, turns: 7 } } });

    await dispatch(rig);

    expect(rig.driver.starts[0]?.budget).toEqual({
      maxTurns: 7,
      maxUsd: 1.5,
      stallMs: 300_000,
      turnMs: 600_000,
    });
  });

  it('passes the agent memory view to the memory source and keeps the whole slice by default', async () => {
    const rig = await makeRig();
    await dispatch(rig);
    const first = rig.memory.filters.at(-1);

    expect(first).toEqual({ tags: [], include_rejected: true });
  });

  it('narrows the memory the Worker sees to the agent tags', async () => {
    const rig = await makeRig();
    await editCompany(rig, {
      implementer: { memory: { tags: ['tooling'], include_rejected: false } },
    });

    await dispatch(rig);

    expect(rig.memory.filters.at(-1)).toEqual({
      tags: ['tooling'],
      include_rejected: false,
    });
  });

  it('refuses to run someone else when the stage agent is archived: the ticket is parked with the reason', async () => {
    const rig = await makeRig();
    await editCompany(rig, { implementer: { archived: true } });
    const id = await rig.request('Fix the doctor check');

    await rig.tick();

    expect(rig.driver.starts).toEqual([]);
    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('disabled or archived');
  });
});

describe('agent fallbacks', () => {
  it('replaces the company fallback list on quota and runs on the fallback entry model', async () => {
    const rig = await makeRig();
    rig.harnesses.add('other');
    rig.harnesses.add('company-fallback');
    await editCompany(rig, {
      implementer: {
        runs_on: {
          fallbacks: [{ harness: 'other', model: { kind: 'model', id: 'haiku' } }],
        },
      },
    });

    await addProject(rig, 'forge', 'FG', { harness_fallbacks: ['company-fallback'] });
    await rig.request('first');
    await rig.tick();
    rig.driver.finish(
      'run-1',
      quotaResult(new Date(rig.clock.now() + 2 * HOUR).toISOString()),
    );

    await rig.flush();
    const report = await rig.tick();

    expect(report.dispatched.map((d) => [d.ticketId, d.kind])).toEqual([
      ['FG-1', 'retry'],
    ]);

    expect(rig.driver.starts[1]?.model).toBe('haiku');
  });

  it('keeps waiting when the agent lists no usable fallback even if the company list has one', async () => {
    const rig = await makeRig();
    rig.harnesses.add('company-fallback');
    await editCompany(rig, {
      implementer: {
        runs_on: {
          fallbacks: [{ harness: 'ghost', model: { kind: 'harness_default' } }],
        },
      },
    });

    await addProject(rig, 'forge', 'FG', { harness_fallbacks: ['company-fallback'] });
    await rig.request('first');
    await rig.tick();
    rig.driver.finish(
      'run-1',
      quotaResult(new Date(rig.clock.now() + 2 * HOUR).toISOString()),
    );

    await rig.flush();
    const report = await rig.tick();

    expect(report.dispatched).toEqual([]);
  });
});

describe('resume after a restart', () => {
  it('continues on the agent of the run: same model and budget keys, from the current settings', async () => {
    const rig = await makeRig();
    await dispatch(rig);
    rig.driver.emit('run-1', { type: 'session', session_ref: 'sess-A' });
    await rig.flush();
    await editCompany(rig, { implementer: { budget: { turns: 9 } } });
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    await rig.restart('srv-b').tick();

    const resumed = rig.driver.starts.at(-1);

    expect(resumed).toMatchObject({ runId: 'run-1', resume: 'sess-A', model: 'sonnet' });
    expect(resumed?.budget.maxTurns).toBe(9);
  });

  it('sends no model on the resume when the agent follows the harness default', async () => {
    const rig = await makeRig();
    await editCompany(rig, {
      implementer: { runs_on: { model: { kind: 'harness_default' } } },
    });

    await dispatch(rig);
    rig.driver.emit('run-1', { type: 'session', session_ref: 'sess-A' });
    await rig.flush();
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    await rig.restart('srv-b').tick();

    expect('model' in (rig.driver.starts.at(-1) ?? {})).toBe(false);
  });
});
