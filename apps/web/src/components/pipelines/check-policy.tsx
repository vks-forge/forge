/**
 * CheckPolicy: what happens when a check stage finds something serious.
 *
 * Why: a reviewer's blocking findings are the owner's call (d-0165): by default they send the
 *   work back to the writer for another round, up to twice, and only then come to the owner; the
 *   owner can instead have a stage hold the ticket for them at once. Which severities count as
 *   blocking, and which earlier writer the work goes back to, belong to the same decision, so
 *   the three controls sit together under one heading. Only what differs from the defaults is
 *   stored (`withPolicy`), so a stage left on defaults stays equal to the shipped list.
 *
 * Exports: CheckPolicy.
 * Depends on: react, components/ui/picker, components/ui/toggle-group, domain/pipeline-copy,
 *   domain/pipeline-policy, types/pipeline-ui.types.
 */

import { useLaneId } from '#/components/pipelines/lane-ids.js';
import { Picker } from '#/components/ui/picker.js';
import { ToggleGroup } from '#/components/ui/toggle-group.js';
import { SEVERITIES, SEVERITY_LABEL } from '#/domain/pipeline-copy.js';
import { policyOf, withPolicy } from '#/domain/pipeline-policy.js';
import type {
  CheckPolicyView,
  CheckStage,
  Member,
  WriterOption,
} from '#/types/pipeline-ui.types.js';

const DEFAULT_TARGET = '__last_writer';

export function CheckPolicy<S extends CheckStage | Member>(props: {
  stage: S;
  writers: readonly WriterOption[];
  /** A group member takes the group's "send back to", so it does not offer it. */
  inGroup?: boolean;
  onChange: (next: S) => void;
}) {
  const { stage } = props;
  const policy = policyOf(stage);
  const set = (change: Partial<CheckPolicyView>): void =>
    props.onChange(withPolicy(stage, { ...policy, ...change }));

  const id = useLaneId(`policy-${stage.id}`);

  return (
    <fieldset className="grid gap-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-medium">
        When this check finds a problem
      </legend>

      <div className="grid gap-1.5">
        <span id={`${id}-mode`} className="text-xs font-medium text-muted">
          On blocking findings
        </span>
        <ToggleGroup
          label="On blocking findings"
          value={policy.on_blocking}
          options={[
            { value: 'rework', label: 'Send back (up to 2 times)' },
            { value: 'hold', label: 'Hold for me' },
          ]}
          onChange={(on_blocking) => set({ on_blocking })}
        />
        <p className="text-xs text-muted">
          {policy.on_blocking === 'rework'
            ? 'The writer gets the findings and tries again. After two tries the ticket comes to you.'
            : 'The ticket stops here and waits for you, with the findings in front of you.'}
        </p>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="text-xs font-medium text-muted">These severities block</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SEVERITIES.map((severity) => (
            <label key={severity} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.blocking.includes(severity)}
                onChange={(event) =>
                  set({
                    blocking: SEVERITIES.filter((s) =>
                      s === severity ? event.target.checked : policy.blocking.includes(s),
                    ),
                  })
                }
                className="size-4 accent-signal"
              />
              {SEVERITY_LABEL[severity]}
            </label>
          ))}
        </div>
      </fieldset>

      {props.inGroup ? null : (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-target`} className="text-xs font-medium text-muted">
            Send back to
          </label>
          <Picker
            id={`${id}-target`}
            label={`Send back to, ${stage.label}`}
            value={policy.rework_to === '' ? DEFAULT_TARGET : policy.rework_to}
            items={[
              {
                value: DEFAULT_TARGET,
                label: 'The last writer above (default)',
              },
              ...props.writers.map((w) => ({ value: w.id, label: w.label })),
            ]}
            onChange={(value) =>
              set({ rework_to: value === DEFAULT_TARGET ? '' : value })
            }
          />
        </div>
      )}
    </fieldset>
  );
}
