/**
 * Copies an agent into a scope under a new name.
 *
 * Why: the quickest way to a good agent is to start from one that is nearly right (a built-in, a
 *   template the company adopted, a colleague's project agent). A copy is a new custom agent that
 *   remembers where it came from (`duplicate:<id>`); it is never a link, so editing it cannot
 *   change the original. The one thing a copy must not carry over is the lane default model, which
 *   follows the company lane matrix and is allowed on the built-in implementer only: the copy names
 *   the model that matrix resolves to today instead. The copy then goes through the same door as
 *   any new agent (name, role bounds, tools, version check).
 *
 * Exports: copyAgent().
 * Depends on: services/agent-state types, services/http/http-errors, types/agent-store. IO: reads
 *   the source scope and the company models.
 */

import type { AgentInput } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';
import type { AgentDuplicateBody } from '#/schemas/agent-api.js';
import type {
  AddAgent,
  AgentListing,
  AgentScope,
  AgentState,
} from '#/types/agent-store.types.js';

/** Copies agent `id` of scope `from` into the scope the body names. */
export async function copyAgent(
  state: AgentState,
  add: AddAgent,
  from: AgentScope,
  id: string,
  body: AgentDuplicateBody,
): Promise<AgentListing & { id: string }> {
  const source = (await state.read(from)).views.find((v) => v.id === id);
  if (!source) {
    throw new HttpError(404, 'agent_not_found', `no agent ${id}`);
  }

  const slug = body.project ?? (from.scope === 'project' ? from.slug : undefined);
  if (body.scope === 'project' && slug === undefined) {
    throw new HttpError(
      400,
      'project_required',
      'name the project to copy the agent into',
    );
  }

  const target: AgentScope =
    body.scope === 'company'
      ? { scope: 'company' }
      : { scope: 'project', slug: slug as string };

  const { archived: _a, origin: _o, ...fields } = source.definition;
  void _a;
  void _o;
  const model = fields.runs_on.model;
  const worker = (await state.read({ scope: 'company' })).forge.models.worker.standard;
  const copy: AgentInput = {
    ...fields,
    name: body.name,
    runs_on: {
      ...fields.runs_on,
      model: model.kind === 'forge_default' ? { kind: 'model', id: worker } : model,
    },
  };

  const done = await add(target, body, copy, `duplicate:${id}`);

  return { ...done.at.listing, id: done.id };
}
