/**
 * IdentitySection: an agent's name, what it is for, and its role.
 *
 * Why: the Director picks an agent by reading its description, and the role sets what the agent
 *   may be allowed to do (a reviewer never writes), so these three decide how the agent is used
 *   before any instruction is read. The description says in its hint that the Director reads
 *   it, so the owner writes it as "use me when...", not as a label. Changing the role may remove
 *   tools and the write scope the new role cannot keep; the section says so before it happens.
 *
 * Exports: IdentitySection.
 * Depends on: components/settings/{settings-card,form-field}, components/ui/{picker,field},
 *   domain/agent-copy, domain/agent-form, schemas/agents, types/agent-ui.types.
 */

import { SettingsCard } from '#/components/settings/settings-card.js';
import { FormField, INPUT_CLASS, TextInput } from '#/components/settings/form-field.js';
import { Picker } from '#/components/ui/picker.js';
import { ROLE_INFO, ROLE_OPTIONS } from '#/domain/agent-copy.js';
import { issueAt, switchRole } from '#/domain/agent-form.js';
import type { AgentRole } from '#/schemas/agents.js';
import type { AgentForm, FormIssue } from '#/types/agent-ui.types.js';

export function IdentitySection(props: {
  form: AgentForm;
  issues: readonly FormIssue[];
  onChange: (next: AgentForm) => void;
  disabled: boolean;
  /** An existing agent keeps its id, so renaming changes only the label. */
  existing: boolean;
}) {
  const { form, issues } = props;

  return (
    <SettingsCard
      id="identity"
      title="Identity"
      description="What the agent is called and what it is for."
    >
      <div className="grid gap-5">
        <FormField
          id="agent-name"
          label="Name"
          hint={
            props.existing
              ? 'Renaming changes the label only; runs keep naming the agent by its id.'
              : 'Becomes the agent’s id, so pick it with care.'
          }
          error={issueAt(issues, 'name')}
        >
          <TextInput
            id="agent-name"
            value={form.name}
            disabled={props.disabled}
            hasHint
            error={issueAt(issues, 'name')}
            autoComplete="off"
            onChange={(e) => props.onChange({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField
          id="agent-description"
          label="Description"
          hint="The Director reads this to decide when to use the agent. Say when it applies."
          error={issueAt(issues, 'description')}
        >
          <textarea
            id="agent-description"
            rows={3}
            value={form.description}
            disabled={props.disabled}
            aria-invalid={issueAt(issues, 'description') ? true : undefined}
            aria-describedby="agent-description-hint"
            onChange={(e) => props.onChange({ ...form, description: e.target.value })}
            className={`${INPUT_CLASS} py-2`}
          />
        </FormField>
        <FormField
          id="agent-role"
          label="Role"
          hint={
            form.role === 'writer' || form.role === 'tester'
              ? `${ROLE_INFO[form.role].blurb} Switching to a reviewer or researcher removes write tools and the write scope.`
              : ROLE_INFO[form.role].blurb
          }
        >
          <Picker
            id="agent-role"
            aria-describedby="agent-role-hint"
            items={ROLE_OPTIONS}
            value={form.role}
            disabled={props.disabled}
            onChange={(role) => props.onChange(switchRole(form, role as AgentRole))}
          />
        </FormField>
      </div>
    </SettingsCard>
  );
}
