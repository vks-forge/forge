/**
 * Project settings, Agents: the agents this project uses, and how it differs from the company.
 *
 * Why: a project rarely wants different agents, but often wants one to read its own house rules
 *   or run on a different harness. This tab lists the company agents as this project sees them
 *   (built-in, overridden, switched off here) next to the project's own agents. An override
 *   changes only instructions and where the agent runs and can be reset to the company default;
 *   a switch-off applies to this project alone. Saves are versions of the project's settings,
 *   and they write through the agents' own controls, so this tab has no shared save bar.
 *
 * Exports: AgentsSection.
 * Depends on: components/agents/agents-workspace, routes/project-settings/use-project-settings-context.
 */

import { useMemo } from 'react';
import { AgentsWorkspace } from '#/components/agents/agents-workspace.js';
import { useProjectSettingsContext } from '#/routes/project-settings/use-project-settings-context.js';

export function AgentsSection() {
  const { slug } = useProjectSettingsContext();
  const scope = useMemo(() => ({ kind: 'project', slug }) as const, [slug]);

  return <AgentsWorkspace scope={scope} />;
}
