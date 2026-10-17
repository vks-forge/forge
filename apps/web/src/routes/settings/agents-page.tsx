/**
 * Forge settings, Agents: the company's roster of agents and the editor for each.
 *
 * Why: who does a piece of work, and on what, used to be spread over a model matrix and one
 *   harness per project, with no way to say "the reviewer is read-only and runs on a deeper
 *   model". The company roster holds the built-in agents (editable, resettable), the owner's
 *   own, and the templates and Director drafts they turn into agents. Each save is a numbered
 *   version of the company settings, and a project can then override an agent's instructions
 *   and harness without touching this roster (see the project's Agents tab).
 *
 * Exports: AgentsPage.
 * Depends on: components/agents/agents-workspace.
 */

import { AgentsWorkspace } from '#/components/agents/agents-workspace.js';

const COMPANY = { kind: 'company' } as const;

export function AgentsPage() {
  return <AgentsWorkspace scope={COMPANY} />;
}
