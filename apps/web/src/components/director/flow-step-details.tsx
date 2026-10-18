/**
 * FlowStepDetails: the settings of one flow step that are not its place in the list.
 *
 * Why: a step has a condition (always, only for some lanes, or when the Director judges it
 *   worth it), a depth for the steps that can work harder or lighter, and instructions that
 *   are added after its playbook. Keeping these behind a "Details" toggle leaves the list
 *   scannable, a line per step, while everything is still one click away. A locked step shows
 *   its condition as plain text, because changing it could let a plan skip a safety step;
 *   only its instructions stay editable.
 *
 * Exports: FlowStepDetails.
 * Depends on: components/settings/form-field, components/ui/field, components/ui/picker,
 *   domain/director-flow-edit, schemas/director-config (types).
 */

import type { FlowStep } from '@forge/core';
import { TextInput } from '#/components/settings/form-field.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';
import { whenKind } from '#/domain/director-flow-edit.js';
import type { PickerItem } from '#/types/picker.types.js';

const WHEN_ITEMS: readonly PickerItem[] = [
  { value: 'always', label: 'Always' },
  { value: 'lanes', label: 'By lane', description: 'Only for the lanes you pick.' },
  {
    value: 'director_decides',
    label: 'Director decides',
    description: 'Runs when the Director judges it worthwhile.',
  },
];

const LANE_ITEMS: readonly PickerItem[] = [
  { value: 'express', label: 'Express' },
  { value: 'standard', label: 'Standard' },
  { value: 'full', label: 'Full' },
];

const DEPTH_ITEMS: readonly PickerItem[] = [
  { value: 'light', label: 'Light', description: 'Skims; fastest.' },
  { value: 'normal', label: 'Normal' },
  { value: 'deep', label: 'Deep', description: 'Reads widely; slowest.' },
];

/** Steps whose work can be done more lightly or more deeply. */
const HAS_DEPTH: ReadonlySet<FlowStep['kind']> = new Set([
  'survey',
  'grill',
  'verify',
  'enhance',
  'research',
  'custom',
]);

export function whenWords(step: FlowStep): string {
  if (typeof step.when === 'object') {
    return `${step.when.lanes.join(', ')} lanes`;
  }

  return step.when === 'always' ? 'always' : 'Director decides';
}

export function FlowStepDetails(props: {
  step: FlowStep;
  onChange: (change: Partial<Omit<FlowStep, 'id' | 'kind' | 'locked'>>) => void;
}) {
  const { step } = props;
  const id = `flow-${step.id}`;
  const kind = whenKind(step);

  return (
    <div className="grid gap-4 border-t border-line px-3 py-4 sm:grid-cols-2">
      {step.kind === 'custom' ? (
        <div className="grid gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-label`} className="text-sm font-medium">
            Name
          </label>
          <TextInput
            id={`${id}-label`}
            value={step.label}
            autoComplete="off"
            onChange={(e) => props.onChange({ label: e.target.value })}
          />
        </div>
      ) : null}

      <div className="grid content-start gap-1.5">
        <p id={`${id}-when`} className="text-sm font-medium">
          Runs
        </p>
        {step.locked ? (
          <p className="text-sm text-muted">Always. This cannot be changed.</p>
        ) : (
          <Picker
            aria-labelledby={`${id}-when`}
            items={WHEN_ITEMS}
            value={kind}
            onChange={(next) =>
              props.onChange({
                when:
                  next === 'lanes'
                    ? { lanes: ['standard', 'full'] }
                    : next === 'director_decides'
                      ? 'director_decides'
                      : 'always',
              })
            }
          />
        )}
      </div>

      {typeof step.when === 'object' && !step.locked ? (
        <div className="grid content-start gap-1.5">
          <p id={`${id}-lanes`} className="text-sm font-medium">
            Lanes
          </p>
          <Picker
            multiple
            aria-labelledby={`${id}-lanes`}
            items={LANE_ITEMS}
            value={step.when.lanes}
            onChange={(lanes) =>
              props.onChange({
                when: {
                  lanes: lanes.filter(
                    (l): l is 'express' | 'standard' | 'full' =>
                      l === 'express' || l === 'standard' || l === 'full',
                  ),
                },
              })
            }
          />
        </div>
      ) : null}

      {HAS_DEPTH.has(step.kind) ? (
        <div className="grid content-start gap-1.5">
          <p id={`${id}-depth`} className="text-sm font-medium">
            Depth
          </p>
          <Picker
            aria-labelledby={`${id}-depth`}
            items={DEPTH_ITEMS}
            value={step.depth ?? 'normal'}
            onChange={(depth) =>
              props.onChange({
                depth: depth === 'light' || depth === 'deep' ? depth : 'normal',
              })
            }
          />
        </div>
      ) : null}

      <div className="grid gap-1.5 sm:col-span-2">
        <label htmlFor={`${id}-instructions`} className="text-sm font-medium">
          Instructions
        </label>
        <textarea
          id={`${id}-instructions`}
          rows={4}
          value={step.instructions ?? ''}
          className={`${INPUT_CLASS} py-2`}
          placeholder={
            step.kind === 'custom'
              ? 'What should the Director do in this step?'
              : 'Optional. Added after the step’s playbook.'
          }
          onChange={(e) => props.onChange({ instructions: e.target.value })}
        />
      </div>
    </div>
  );
}
