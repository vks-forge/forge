/**
 * AgentPicker: choose which agent a stage (or a routing rule) runs.
 *
 * Why: a stage names an agent from the effective roster, and the roster has rows that look
 *   usable but are not: an agent switched off for this project or archived would make the ticket
 *   fail closed at dispatch. They stay in the list, greyed, with the reason under them, so the
 *   owner sees they exist and why they cannot be picked, never a list that silently lacks them.
 *   Agents are grouped by role (writers, testers, reviewers, researchers) because the role is
 *   what decides where a stage can go. A routing rule passes `only` to offer checks alone.
 *
 * Exports: AgentPicker.
 * Depends on: react, components/ui/picker, domain/agent-copy, schemas/agents.
 */

import { Picker } from '#/components/ui/picker.js';
import { ROLE_INFO } from '#/domain/agent-copy.js';
import type { AgentRole, AgentView } from '#/schemas/agents.js';
import type { PickerItem } from '#/types/picker.types.js';

function itemOf(agent: AgentView): PickerItem {
  const off = agent.tags.includes('disabled')
    ? 'Switched off for this scope. Switch it on under Agents.'
    : agent.tags.includes('archived')
      ? 'Archived. Bring it back under Agents.'
      : undefined;

  return {
    value: agent.id,
    label: agent.definition.name,
    group: ROLE_INFO[agent.definition.role].label,
    description: ROLE_INFO[agent.definition.role].blurb,
    ...(off ? { disabled: true, disabledReason: off, badge: 'unavailable' } : {}),
  };
}

export function AgentPicker(props: {
  id: string;
  label: string;
  value: string;
  roster: readonly AgentView[];
  onChange: (agentId: string) => void;
  /** Offer only agents with these roles. */
  only?: readonly AgentRole[];
  error?: string | undefined;
  disabled?: boolean;
}) {
  const { only } = props;
  const items = props.roster
    .filter((a) => only === undefined || only.includes(a.definition.role))
    .map(itemOf);

  return (
    <Picker
      id={props.id}
      label={props.label}
      items={items}
      value={items.some((i) => i.value === props.value) ? props.value : ''}
      placeholder={props.value === '' ? 'Choose an agent' : props.value}
      onChange={props.onChange}
      error={props.error ?? false}
      disabled={props.disabled ?? false}
      emptyText="No agents to choose from. Add one under Agents."
    />
  );
}
