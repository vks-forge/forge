/**
 * Finish-stage fields: the settings of the Director check and of the sign-off, and the question a
 * sign-off asks.
 *
 * Why: the last stages before merge decide who puts a name on the work. The Director check
 *   compares the finished work with the plan, and the owner chooses what a blocking finding does
 *   (hold the ticket for them, the safe default, or send it back to the writer) and which
 *   severities block. The sign-off says who signs: the Director signs tier A and B when every
 *   check passed and the tier is within its limit (Forge settings, Director), or the owner always
 *   does. Tier C is the owner's whatever is chosen here, and the fields say so, so nobody believes
 *   this switch can hand protected files to the Director. Only what differs from the defaults is
 *   stored, as with every check policy.
 *
 * Exports: DirectorCheckFields, SignOffFields, PromptField.
 * Depends on: components/pipelines/lane-ids, components/ui/{field,toggle-group},
 *   domain/pipeline-copy, domain/pipeline-policy, @forge/core (types).
 */

import type { DirectorCheckStage, SignOffStage } from '@forge/core';
import { useLaneId } from '#/components/pipelines/lane-ids.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { SEVERITIES, SEVERITY_LABEL } from '#/domain/pipeline-copy.js';
import { DEFAULT_BLOCKING } from '#/domain/pipeline-policy.js';

/** What to ask the owner; shared by the sign-off and the older human stage. */
export function PromptField(props: {
  stageId: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const prefix = useLaneId('');
  const id = `${prefix}prompt-${props.stageId}`;

  return (
    <Field
      id={id}
      label="What to ask you"
      hint="Shown with the review: the ticket waits here until you approve or send it back."
    >
      <textarea
        id={id}
        aria-describedby={`${id}-hint`}
        value={props.value}
        maxLength={500}
        rows={3}
        onChange={(event) => props.onChange(event.target.value)}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

export function DirectorCheckFields(props: {
  stage: DirectorCheckStage;
  onChange: (next: DirectorCheckStage) => void;
}) {
  const { stage } = props;
  const id = useLaneId(`dcheck-${stage.id}`);
  const mode = stage.on_blocking ?? 'hold';
  const blocking: readonly (typeof SEVERITIES)[number][] =
    stage.blocking ?? DEFAULT_BLOCKING;

  const withMode = (next: 'hold' | 'rework'): void => {
    const rest = { ...stage };

    delete rest.on_blocking;
    props.onChange(next === 'hold' ? rest : { ...rest, on_blocking: next });
  };

  const withBlocking = (next: readonly (typeof SEVERITIES)[number][]): void => {
    const rest = { ...stage };
    const same =
      next.length === DEFAULT_BLOCKING.length &&
      DEFAULT_BLOCKING.every((severity) => next.includes(severity));

    delete rest.blocking;
    props.onChange(same ? rest : { ...rest, blocking: [...next] });
  };

  return (
    <fieldset className="grid gap-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-medium">
        When the Director finds the work does not match the plan
      </legend>
      <div className="grid gap-1.5">
        <span id={`${id}-mode`} className="text-xs font-medium text-muted">
          On blocking findings
        </span>
        <ToggleGroup
          label="On blocking findings"
          value={mode}
          options={[
            { value: 'hold', label: 'Hold for me' },
            { value: 'rework', label: 'Send back (up to 2 times)' },
          ]}
          onChange={withMode}
        />
        <p className="text-xs text-muted">
          {mode === 'hold'
            ? 'The ticket stops and waits for you, with the findings in front of you.'
            : 'The writer gets the findings and tries again. After two tries the ticket comes to you.'}
        </p>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="text-xs font-medium text-muted">These severities block</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SEVERITIES.map((severity) => (
            <label key={severity} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={blocking.includes(severity)}
                onChange={(event) =>
                  withBlocking(
                    SEVERITIES.filter((s) =>
                      s === severity ? event.target.checked : blocking.includes(s),
                    ),
                  )
                }
                className="size-4 accent-signal"
              />
              {SEVERITY_LABEL[severity]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted">
        The Director reads the plan, the diff and the reports, never the Worker’s own
        account. A ticket with no plan skips this check.
      </p>
    </fieldset>
  );
}

export function SignOffFields(props: {
  stage: SignOffStage;
  onChange: (next: SignOffStage) => void;
}) {
  const { stage } = props;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Who signs</span>
        <ToggleGroup
          label={`Who signs, ${stage.label}`}
          value={stage.signer}
          options={[
            { value: 'director_or_owner', label: 'Director signs tier A and B' },
            { value: 'owner', label: 'Always me' },
          ]}
          onChange={(signer) => props.onChange({ ...stage, signer })}
        />
        <p className="text-xs text-muted">
          {stage.signer === 'director_or_owner'
            ? 'The Director signs only when every check passed outright and the change is within its limit. Otherwise it comes to you with the reason. Tier C always needs you.'
            : 'Every ticket waits for you to sign, whatever the tier.'}
        </p>
      </div>
      <PromptField
        stageId={stage.id}
        value={stage.prompt}
        onChange={(prompt) => props.onChange({ ...stage, prompt })}
      />
    </div>
  );
}
