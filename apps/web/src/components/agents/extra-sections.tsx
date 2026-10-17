/**
 * The smaller sections of the agent editor: write scope, inputs and output, skills and memory, budget.
 *
 * Why: each of these is a limit or a hand-off an owner sets once and rarely revisits, so they
 *   share one file and stay short. The write scope exists only for a writer or tester (a
 *   reviewer cannot change files, so the section says that instead of showing a field that would
 *   be refused). Inputs and output are stored now and used when pipelines arrive, and the note
 *   says so rather than implying an effect. Memory tags narrow what project memory the agent
 *   reads (none means all of it). A blank budget follows the Forge default, which is shown in
 *   the field so the owner knows what blank means.
 *
 * Exports: WriteScopeSection, HandoffSection, SkillsMemorySection, BudgetSection.
 * Depends on: react, api/use-settings-data, components/agents/chip-input,
 *   components/settings/{settings-card,form-field}, components/ui/field, domain/agent-form,
 *   schemas/agents, types/agent-ui.types.
 */

import { useCompanySettings } from '#/api/use-settings-data.js';
import { ChipInput } from '#/components/agents/chip-input.js';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { Switch } from '#/components/ui/field.js';
import { issueAt } from '#/domain/agent-form.js';
import type { ArtifactKind } from '#/schemas/agents.js';
import type { AgentSectionProps } from '#/types/agent-ui.types.js';

export function WriteScopeSection(props: AgentSectionProps) {
  const { form } = props;
  const readOnly = form.role === 'reviewer' || form.role === 'researcher';

  return (
    <SettingsCard
      id="write-scope"
      title="Write scope"
      description="The paths this agent may change. A change outside them is refused."
    >
      {readOnly ? (
        <p className="text-sm text-muted">
          A {form.role} cannot change files, so it has no write scope.
        </p>
      ) : (
        <ChipInput
          id="write-scope-input"
          label="Allowed paths"
          values={form.write_scope}
          disabled={props.disabled}
          placeholder="src/**"
          hint="Globs relative to the repository. Use ** for every path."
          error={issueAt(props.issues, 'write_scope')}
          onChange={(write_scope) => props.onChange({ ...form, write_scope })}
        />
      )}
    </SettingsCard>
  );
}

const KINDS: readonly { value: ArtifactKind; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'diff', label: 'Diff' },
  { value: 'finish_claims', label: 'Finish claims' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'test_report', label: 'Test report' },
  { value: 'findings', label: 'Findings' },
  { value: 'gate_report', label: 'Gate report' },
];

function KindGroup(props: {
  legend: string;
  values: readonly ArtifactKind[];
  disabled: boolean;
  onChange: (next: readonly ArtifactKind[]) => void;
}) {
  return (
    <fieldset className="grid gap-2" disabled={props.disabled}>
      <legend className="mb-1 text-sm font-medium">{props.legend}</legend>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <label
            key={kind.value}
            className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm has-[:checked]:border-signal has-[:checked]:bg-signal-soft has-[:disabled]:cursor-not-allowed"
          >
            <input
              type="checkbox"
              className="size-4 accent-signal"
              checked={props.values.includes(kind.value)}
              onChange={() =>
                props.onChange(
                  props.values.includes(kind.value)
                    ? props.values.filter((v) => v !== kind.value)
                    : [...props.values, kind.value],
                )
              }
            />
            {kind.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function HandoffSection(props: AgentSectionProps) {
  const { form } = props;

  return (
    <SettingsCard
      id="handoff"
      title="Inputs and output"
      description="What the agent takes in and what it hands on. Saved now; used when pipelines arrive."
    >
      <div className="grid gap-5">
        <KindGroup
          legend="Takes in"
          values={form.inputs}
          disabled={props.disabled}
          onChange={(inputs) => props.onChange({ ...form, inputs })}
        />
        <KindGroup
          legend="Hands on"
          values={form.output}
          disabled={props.disabled}
          onChange={(output) => props.onChange({ ...form, output })}
        />
      </div>
    </SettingsCard>
  );
}

export function SkillsMemorySection(props: AgentSectionProps) {
  const { form } = props;

  return (
    <SettingsCard
      id="skills-memory"
      title="Skills and memory"
      description="Extra know-how the agent loads, and which project memory it reads."
    >
      <div className="grid gap-5">
        <ChipInput
          id="skills-input"
          label="Skills"
          values={form.skills}
          disabled={props.disabled}
          placeholder="Skill name"
          emptyNote="No extra skills."
          onChange={(skills) => props.onChange({ ...form, skills })}
        />
        <ChipInput
          id="memory-tags-input"
          label="Memory tags"
          values={form.memory.tags}
          disabled={props.disabled}
          placeholder="Tag"
          hint="Only memory records with one of these tags are read."
          emptyNote="No tags: the agent reads the whole memory slice."
          onChange={(tags) =>
            props.onChange({ ...form, memory: { ...form.memory, tags } })
          }
        />
        <div className="flex items-center gap-3">
          <Switch
            label="Include rejected approaches"
            checked={form.memory.include_rejected}
            disabled={props.disabled}
            onChange={(include_rejected) =>
              props.onChange({ ...form, memory: { ...form.memory, include_rejected } })
            }
          />
          <span className="text-sm">Include rejected approaches</span>
        </div>
      </div>
    </SettingsCard>
  );
}

export function BudgetSection(props: AgentSectionProps) {
  const { form } = props;
  const engine = useCompanySettings().data?.config.engine.run_budget;
  const fields = [
    {
      key: 'usd',
      label: 'Spend limit (USD)',
      placeholder: engine ? `Forge default: ${engine.max_usd}` : 'Forge default',
    },
    {
      key: 'turns',
      label: 'Turn limit',
      placeholder: engine ? `Forge default: ${engine.max_turns}` : 'Forge default',
    },
    { key: 'minutes', label: 'Time limit (minutes)', placeholder: 'Forge default' },
  ] as const;

  return (
    <SettingsCard
      id="budget"
      title="Budget"
      description="Limits for one run of this agent. Leave a box blank to follow the Forge default."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {fields.map((f) => (
          <FormField
            key={f.key}
            id={`budget-${f.key}`}
            label={f.label}
            error={issueAt(props.issues, `budget.${f.key}`)}
          >
            <TextInput
              id={`budget-${f.key}`}
              inputMode="decimal"
              value={form.budget[f.key]}
              placeholder={f.placeholder}
              disabled={props.disabled}
              error={issueAt(props.issues, `budget.${f.key}`)}
              onChange={(e) =>
                props.onChange({
                  ...form,
                  budget: { ...form.budget, [f.key]: e.target.value },
                })
              }
            />
          </FormField>
        ))}
      </div>
      <p className="text-xs text-muted">
        The time limit is saved but not enforced yet; no harness can stop a run on a
        clock.
      </p>
    </SettingsCard>
  );
}
