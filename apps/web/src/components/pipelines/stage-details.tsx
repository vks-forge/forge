/**
 * StageDetails: the settings of one stage, shaped by what kind of stage it is.
 *
 * Why: a stage is one of five things and each has different knobs: an agent (which one, and for
 *   a test writer whether the new tests must fail first), a script gate (its command), a group
 *   (two to four checks that run together), the owner's own sign-off (what to ask them), and
 *   merge or G1, which have nothing to set. Putting the knobs that fit and no others keeps the
 *   panel short, and a check stage always shows what happens to blocking findings (d-0165), so
 *   that choice is never hidden. A name, shown on the strip and in problems, is editable on
 *   every stage that can be edited.
 *
 * Exports: StageDetails, AgentStageFields.
 * Depends on: react, components/pipelines/{agent-picker,check-policy,group-members,script-fields},
 *   components/settings/form-field, components/ui/field, domain/pipeline-edit, @forge/core (types).
 */

import { isCheckRole } from '@forge/core';
import type { AgentStage, AgentView, PipelineDefinition, Stage } from '@forge/core';
import { useLaneId } from '#/components/pipelines/lane-ids.js';
import { AgentPicker } from '#/components/pipelines/agent-picker.js';
import { CheckPolicy } from '#/components/pipelines/check-policy.js';
import { GroupMembers } from '#/components/pipelines/group-members.js';
import { ScriptFields } from '#/components/pipelines/script-fields.js';
import { TextInput } from '#/components/settings/form-field.js';
import { Field, INPUT_CLASS, Switch } from '#/components/ui/field.js';
import { roleOf, takenIds } from '#/domain/pipeline-edit.js';
import { writersAbove } from '#/domain/pipeline-policy.js';
import type { WriterOption } from '#/types/pipeline-ui.types.js';

/** The agent picker, the red-proof switch of a test writer and the policy of a check. */
export function AgentStageFields(props: {
  stage: AgentStage;
  roster: readonly AgentView[];
  writers: readonly WriterOption[];
  inGroup?: boolean;
  onChange: (next: AgentStage) => void;
}) {
  const { stage, roster } = props;
  const role = roleOf(stage, roster);
  const id = useLaneId(`agent-${stage.id}`);

  return (
    <div className="grid gap-3">
      <Field id={`${id}-agent`} label="Agent">
        <AgentPicker
          id={`${id}-agent`}
          label={`Agent for ${stage.label}`}
          value={stage.agent}
          roster={roster}
          onChange={(agent) => {
            const next = { ...stage, agent };

            // Red proof is a tester's: moving to another role takes it off, so no stale setting stays.
            if (roleOf(next, roster) !== 'tester') {
              delete next.proof;
            }

            props.onChange(next);
          }}
        />
      </Field>
      {role === 'tester' ? (
        <div className="flex items-start gap-3">
          <Switch
            checked={stage.proof === 'red'}
            label={`Red proof for ${stage.label}`}
            onChange={(on) => {
              const next = { ...stage };

              if (on) {
                next.proof = 'red';
              } else {
                delete next.proof;
              }

              props.onChange(next);
            }}
          />
          <p className="text-sm">
            <span className="font-medium">Red proof.</span>{' '}
            <span className="text-muted">
              The new tests must fail before the implementation. If they already pass, the
              reviewer is told.
            </span>
          </p>
        </div>
      ) : null}
      {isCheckRole(role) ? (
        <CheckPolicy
          stage={stage}
          writers={props.writers}
          {...(props.inGroup ? { inGroup: true } : {})}
          onChange={props.onChange}
        />
      ) : null}
    </div>
  );
}

export function StageDetails(props: {
  stage: Stage;
  def: PipelineDefinition;
  roster: readonly AgentView[];
  onChange: (next: Stage) => void;
}) {
  const { stage, def, roster } = props;
  const writers = writersAbove(def, stage.id, roster);
  const prefix = useLaneId('');

  if (stage.kind === 'merge') {
    return (
      <p className="px-3 pb-3 text-sm text-muted">
        Merge is the last stage of every pipeline. It happens only after every stage above
        has passed, and it cannot be moved or removed.
      </p>
    );
  }

  if (stage.kind === 'script_gate' && 'builtin' in stage.run) {
    return (
      <p className="px-3 pb-3 text-sm text-muted">
        The independent gate. It checks the finished work, never trusting what the writer
        claims, and it is required after the last writer. It cannot be moved, changed or
        removed.
      </p>
    );
  }

  return (
    <div className="grid gap-3 border-t border-line px-3 py-3">
      <Field id={`${prefix}label-${stage.id}`} label="Name">
        <TextInput
          id={`${prefix}label-${stage.id}`}
          value={stage.label}
          maxLength={80}
          onChange={(event) => props.onChange({ ...stage, label: event.target.value })}
        />
      </Field>

      {stage.kind === 'agent' ? (
        <AgentStageFields
          stage={stage}
          roster={roster}
          writers={writers}
          onChange={props.onChange}
        />
      ) : null}

      {stage.kind === 'script_gate' && 'command' in stage.run ? (
        <>
          <ScriptFields stage={stage} onChange={props.onChange} />
          <CheckPolicy stage={stage} writers={writers} onChange={props.onChange} />
        </>
      ) : null}

      {stage.kind === 'group' ? (
        <GroupMembers
          group={stage}
          roster={roster}
          writers={writers}
          taken={takenIds(def)}
          onChange={props.onChange}
        />
      ) : null}

      {stage.kind === 'human' ? (
        <Field
          id={`${prefix}prompt-${stage.id}`}
          label="What to ask you"
          hint="Shown with the review: the ticket waits here until you approve or send it back."
        >
          <textarea
            id={`${prefix}prompt-${stage.id}`}
            aria-describedby={`${prefix}prompt-${stage.id}-hint`}
            value={stage.prompt}
            maxLength={500}
            rows={3}
            onChange={(event) => props.onChange({ ...stage, prompt: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
      ) : null}
    </div>
  );
}
