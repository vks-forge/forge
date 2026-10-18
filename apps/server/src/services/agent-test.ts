/**
 * Test agent: one short model call with an agent's own model and instructions.
 *
 * Why: before trusting an agent with a ticket the owner wants to see it answer. The call is
 *   deliberately small: no tools, no worktree, no session, no dollar cap (the owner chose
 *   that, d-0167) but a 60 second timeout, and only one at a time per harness so a double click cannot spend twice. It runs only on the
 *   owner's click, on a harness that is ready (a paused or signed-out harness would fail in a
 *   confusing way, so the owner is told why instead, 409). A failed call is still a 200 with
 *   `ok: false` and an error family the screen can put in plain words; only the cases where no
 *   call was made are HTTP errors. Nothing it returns is saved.
 *
 * Exports: createAgentTester(), TEST_PROMPT, TEST_TIMEOUT_MS.
 * Depends on: @forge/core (config, AgentTestResult), services/agent-readiness,
 *   services/http/http-errors, types/agent-store. IO: one probe call through the driver.
 */

import { BUILTIN_PROJECT_SETTINGS } from '@forge/core';
import type { AgentTestResult } from '@forge/core';
import type { AgentTestBody } from '#/schemas/agent-api.js';
import { createAgentReadiness } from '#/services/agent-readiness.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { AgentDeps } from '#/types/agent-store.types.js';

export const TEST_PROMPT =
  'In one line, state your role and the first rule in your instructions.';
export const TEST_TIMEOUT_MS = 60_000;

const REPLY_LIMIT = 2000;

export function createAgentTester(deps: AgentDeps) {
  const readiness = createAgentReadiness(deps);
  const running = new Set<string>();

  return async function test(body: AgentTestBody): Promise<AgentTestResult> {
    if (!deps.ports) {
      throw new HttpError(503, 'not_available', 'this server has no harness to test on');
    }

    const known =
      body.project === undefined
        ? undefined
        : await deps.storage.transaction(async (tx) =>
            (await tx.projects.list()).some((p) => p.slug === body.project),
          );

    if (known === false) {
      throw new HttpError(404, 'project_not_found', `no project ${body.project}`);
    }

    const projectDefault =
      body.project === undefined
        ? BUILTIN_PROJECT_SETTINGS.default_harness
        : (await deps.config.project(body.project)).config.project.default_harness;

    const { harness, model } = body.agent.runs_on;
    const id = harness === 'project_default' ? projectDefault : harness;
    const facts = (await readiness.harnesses()).find((h) => h.id === id);
    const driver = deps.ports.drivers.get(id);

    if (!facts || !driver || !facts.ready) {
      const reasons = facts?.reasons.length
        ? facts.reasons
        : [`The harness "${id}" is not installed on this server.`];

      throw new HttpError(409, 'harness_not_ready', reasons.join(' '), {
        issues: reasons.map((message) => ({ path: 'runs_on.harness', message })),
      });
    }

    if (running.has(id)) {
      throw new HttpError(409, 'test_in_progress', `a test is already running on ${id}`);
    }

    const worker = (await deps.config.company()).config.models.worker.standard;
    const wanted =
      model.kind === 'model'
        ? model.id
        : model.kind === 'forge_default'
          ? worker
          : undefined;

    running.add(id);
    try {
      const r = await driver.probe({
        ...(wanted === undefined ? {} : { model: wanted }),
        instructions: body.agent.instructions,
        prompt: TEST_PROMPT,
        timeoutMs: TEST_TIMEOUT_MS,
      });

      const used = r.modelUsed ?? wanted;

      return {
        ok: r.ok,
        ...(r.reply === undefined ? {} : { reply: r.reply.slice(0, REPLY_LIMIT) }),
        ...(used === undefined ? {} : { model_used: used }),
        harness_id: id,
        duration_ms: r.durationMs,
        ...(r.costUsd === undefined ? {} : { cost_usd: r.costUsd }),
        ...(r.error === undefined ? {} : { error: r.error }),
      };
    } catch (e) {
      return {
        ok: false,
        harness_id: id,
        duration_ms: 0,
        error: { family: 'crash', message: e instanceof Error ? e.message : String(e) },
      };
    } finally {
      running.delete(id);
    }
  };
}
