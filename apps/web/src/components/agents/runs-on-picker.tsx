/**
 * RunsOnPicker: one harness and one model, the pair an agent (or one of its fallbacks) runs on.
 *
 * Why: where an agent runs is always a pair, and the same pair appears for the main choice and
 *   for each fallback. A harness that cannot run today stays in the list, disabled, with the
 *   reason under its name, so the owner is told why it is unavailable rather than left to
 *   wonder. Models are grouped by what they are recommended for (a reviewer is steered to deep
 *   models, a writer to fast ones) and carry their speed and cost. "Harness default" sends no
 *   model at all and follows the harness forever; "Forge default" (the lane model) is offered
 *   only to the built-in implementer; any other model id can be typed because harnesses name
 *   models their own way.
 *
 * Exports: RunsOnPicker.
 * Depends on: react, components/ui/picker, components/settings/form-field, domain/agent-models,
 *   schemas/agents.
 */

import { useMemo } from 'react';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { Picker } from '#/components/ui/picker.js';
import {
  choiceFromValue,
  CUSTOM_MODEL,
  harnessItems,
  modelItems,
  modelsFor,
  modelValue,
} from '#/domain/agent-models.js';
import type { AgentRole, ModelChoice, RunsOnHarness } from '#/schemas/agents.js';

export function RunsOnPicker(props: {
  /** Unique per picker on the page, for ids and accessible names. */
  prefix: string;
  /** Prepended to the accessible names, such as "Fallback 2 ". */
  namePrefix?: string;
  harness: string;
  model: ModelChoice;
  role: AgentRole;
  harnesses: readonly RunsOnHarness[];
  allowForgeDefault: boolean;
  disabled: boolean;
  modelError: string | undefined;
  onChange: (next: { harness: string; model: ModelChoice }) => void;
}) {
  const { prefix, namePrefix = '', harness, model } = props;
  const models = useMemo(
    () => modelsFor(harness, props.harnesses),
    [harness, props.harnesses],
  );

  const items = useMemo(
    () => modelItems(models, props.role, props.allowForgeDefault),
    [models, props.role, props.allowForgeDefault],
  );

  const value = modelValue(model, models);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${prefix}-harness`} label={`${namePrefix}Harness`}>
        <Picker
          id={`${prefix}-harness`}
          items={harnessItems(props.harnesses)}
          value={harness}
          disabled={props.disabled}
          onChange={(next) => props.onChange({ harness: next, model })}
        />
      </FormField>
      <FormField
        id={`${prefix}-model`}
        label={`${namePrefix}Model`}
        error={props.modelError}
      >
        <Picker
          id={`${prefix}-model`}
          items={items}
          value={value}
          disabled={props.disabled}
          error={props.modelError !== undefined}
          onChange={(next) => {
            if (next === CUSTOM_MODEL && value === CUSTOM_MODEL) {
              return;
            }

            props.onChange({ harness, model: choiceFromValue(next) });
          }}
        />
        {value === CUSTOM_MODEL && model.kind === 'model' ? (
          <TextInput
            id={`${prefix}-custom`}
            aria-label={`${namePrefix}Custom model id`}
            value={model.id}
            disabled={props.disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder="Model id"
            error={props.modelError}
            onChange={(e) =>
              props.onChange({ harness, model: { kind: 'model', id: e.target.value } })
            }
          />
        ) : null}
      </FormField>
    </div>
  );
}
