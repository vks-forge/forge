/**
 * Draft an agent from a description: the Director's `draft_agent` step.
 *
 * Why: most owners know what they want an agent to do, not how to write its instructions or
 *   which tools suit its role. The Director drafts a definition from the owner's words, given
 *   what is actually available here: the tool ids of this catalogue per role, the harnesses
 *   that are ready with their models, the names already taken and the house rules. The draft
 *   is untrusted model output, so it goes through the same checks as a saved agent (role
 *   bounds, known tools) and a draft that breaks them is a 422 with every broken rule listed;
 *   a good one is returned and nothing is written: only the owner pressing Save saves it.
 *
 * Exports: createAgentDrafter().
 * Depends on: @forge/core (DraftAgentOutput, isWriteClassTool), services/agent-readiness,
 *   services/agent-store types, services/http/http-errors, schemas/agent-api. IO: one Director step.
 */

import { DraftAgentOutput, isWriteClassTool } from '@forge/core';
import { DraftAgentWire } from '#/schemas/agent-api.js';
import type { AgentDraftBody } from '#/schemas/agent-api.js';
import { createAgentReadiness } from '#/services/agent-readiness.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { AgentDeps, AgentStore } from '#/types/agent-store.types.js';

const draftInvalid = (issues: { path: string; message: string }[]): HttpError =>
  new HttpError(
    422,
    'draft_invalid',
    issues[0]?.message ?? 'the draft is not a valid agent',
    { issues },
  );

export function createAgentDrafter(deps: AgentDeps, store: AgentStore) {
  const readiness = createAgentReadiness(deps);

  return async function draft(body: AgentDraftBody): Promise<DraftAgentOutput> {
    if (!deps.ports) {
      throw new HttpError(
        503,
        'not_available',
        'this server has no Director model to ask',
      );
    }

    if (body.scope === 'project' && body.project === undefined) {
      throw new HttpError(400, 'project_required', 'name the project the agent is for');
    }

    const scope =
      body.scope === 'project'
        ? ({ scope: 'project', slug: body.project as string } as const)
        : ({ scope: 'company' } as const);

    const { agents } = await store.list(scope);
    const forge =
      scope.scope === 'project'
        ? (await deps.config.project(scope.slug)).config.forge
        : (await deps.config.company()).config;

    const toolIds = await store.toolIds();
    const readOnly = toolIds.filter((t) => !isWriteClassTool(t));
    const harnesses = (await readiness.harnesses())
      .filter((h) => h.ready)
      .map((h) => ({
        id: h.id,
        models: h.models.map((m) => ({
          id: m.id,
          label: m.label,
          recommended_for: m.recommended_for,
        })),
      }));

    const answer = await deps.ports.llm.step(
      'draft_agent',
      {
        description: body.description,
        scope: body.scope,
        allowed_tools: {
          writer: toolIds,
          tester: toolIds,
          reviewer: readOnly,
          researcher: readOnly,
        },
        harnesses,
        existing_names: agents.map((a) => a.definition.name),
        house_rules: forge.director.house_rules,
      },
      DraftAgentWire,
      {
        model: forge.models.director.draft_agent,
        budgetUsd: forge.engine.step_budget_usd,
        timeoutMs: forge.director.step_timeouts_ms.draft_agent,
      },
    );

    if (!answer.ok) {
      const { kind, message } = answer.error;
      if (kind === 'stall') {
        throw new HttpError(
          504,
          'step_timeout',
          'the Director did not answer in time; try again',
        );
      }

      if (kind === 'invalid_output') {
        throw draftInvalid([{ path: '', message }]);
      }

      throw new HttpError(
        502,
        'draft_failed',
        `the Director could not draft the agent (${kind})`,
      );
    }

    const parsed = DraftAgentOutput.safeParse(answer.value);
    if (!parsed.success) {
      throw draftInvalid(
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const { tools } = parsed.data.definition;
    const unknown =
      tools === 'lane_default' ? [] : tools.filter((t) => !toolIds.includes(t));

    if (unknown.length > 0) {
      throw draftInvalid(
        unknown.map((t) => ({ path: 'definition.tools', message: `unknown tool ${t}` })),
      );
    }

    return parsed.data;
  };
}
