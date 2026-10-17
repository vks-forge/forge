/**
 * RoutingRuleRow: one routing rule: which paths, which check to add, in what order.
 *
 * Why: a rule is a sentence the owner can read aloud: "when a change touches these paths, add
 *   this reviewer". Paths are glob chips (one token each, so a stray newline cannot become an
 *   empty path), the agent picker offers reviewers and researchers only because routing can add
 *   checks, never writers (d-0069), and the row has move and remove buttons named for the rule so
 *   the order and the list are editable from the keyboard. Problems core finds for this rule
 *   (a switched-off agent, a repeated id) show under it in words.
 *
 * Exports: RoutingRuleRow.
 * Depends on: react, lucide-react, components/agents/chip-input, components/pipelines/agent-picker,
 *   components/ui/*, domain/pipeline-copy, @forge/core (types).
 */

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { AgentView, PipelineProblem, RoutingRule } from '@forge/core';
import { ChipInput } from '#/components/agents/chip-input.js';
import { AgentPicker } from '#/components/pipelines/agent-picker.js';
import { TextInput } from '#/components/settings/form-field.js';
import { Field } from '#/components/ui/field.js';
import { IconButton } from '#/components/ui/icon-button.js';
import { problemWords } from '#/domain/pipeline-copy.js';

export function RoutingRuleRow(props: {
  rule: RoutingRule;
  position: number;
  count: number;
  roster: readonly AgentView[];
  problems: readonly PipelineProblem[];
  onChange: (next: RoutingRule) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { rule } = props;
  const name = rule.label && rule.label !== '' ? rule.label : `Rule ${props.position}`;
  const id = `rule-${rule.id}`;

  return (
    <li
      aria-label={name}
      className={`grid gap-3 rounded-lg border bg-surface p-3 ${
        props.problems.length > 0 ? 'border-danger' : 'border-line'
      }`}
    >
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field id={`${id}-label`} label="Name (optional)">
            <TextInput
              id={`${id}-label`}
              value={rule.label ?? ''}
              maxLength={80}
              placeholder="Network changes need the network reviewer"
              onChange={(event) => {
                const label = event.target.value;

                props.onChange({
                  id: rule.id,
                  paths: rule.paths,
                  add: rule.add,
                  ...(label === '' ? {} : { label }),
                });
              }}
            />
          </Field>
        </div>
        <IconButton
          label={`Move ${name} up`}
          blockedReason={props.position === 1 ? 'It is already first.' : undefined}
          onClick={() => props.onMove(-1)}
        >
          <ChevronUp aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          label={`Move ${name} down`}
          blockedReason={
            props.position === props.count ? 'It is already last.' : undefined
          }
          onClick={() => props.onMove(1)}
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton label={`Remove ${name}`} onClick={props.onRemove}>
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>

      <ChipInput
        id={`${id}-paths`}
        label={`Paths for ${name}`}
        values={rule.paths}
        placeholder="**/*.tf"
        hint="Glob patterns. The rule fires when the plan or the real change touches any of them."
        emptyNote="Add at least one path."
        onChange={(paths) => props.onChange({ ...rule, paths: [...paths] })}
      />

      <Field
        id={`${id}-agent`}
        label="Then add this check"
        hint="Reviewers and researchers only; a rule can add a check, never a writer."
      >
        <AgentPicker
          id={`${id}-agent`}
          label={`Check to add for ${name}`}
          value={rule.add}
          roster={props.roster}
          only={['reviewer', 'researcher']}
          onChange={(add) => props.onChange({ ...rule, add })}
        />
      </Field>

      {props.problems.length > 0 ? (
        <ul className="grid gap-1">
          {props.problems.map((problem) => (
            <li
              key={`${problem.code}-${problem.message}`}
              role="alert"
              className="text-xs text-danger"
            >
              {problemWords(problem)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
