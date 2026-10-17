/**
 * ModelFields: choose the model each Director step runs on.
 *
 * Why: planning is cheaper and faster when each step uses the right model (Opus to write a
 *   plan, Sonnet for a grill turn), so every Director step gets its own row with a plain
 *   name and what the step does. Opus, Sonnet and Haiku cover almost every choice, so they are
 *   one click; any other model name can still be typed because harnesses name models their own
 *   way. A row never shows an empty choice: a step the server did not list yet reads as its
 *   built-in default until the owner picks one. The choices are the models the harness
 *   reports (`GET /agents/runs-on`, the same list the agent editor uses), so a model the build
 *   adds shows up here too; until that list loads, or when no harness reports any, the
 *   built-in Opus, Sonnet and Haiku stand in.
 *
 * Exports: ModelFields.
 * Depends on: react, api/use-agents, components/settings/form-field, components/ui/picker,
 *   domain/agent-models, domain/director-settings, schemas/director-config,
 *   types/settings-fields.types.
 */

import { useMemo, useState } from 'react';
import { useRunsOn } from '#/api/use-agents.js';
import { TextInput } from '#/components/settings/form-field.js';
import { Picker } from '#/components/ui/picker.js';
import { directorModelChoices } from '#/domain/agent-models.js';
import { STEP_INFO } from '#/domain/director-settings.js';
import { STEP_NAMES } from '#/schemas/director-config.js';
import type { StepName } from '#/schemas/director-config.js';
import type { PickerItem } from '#/types/picker.types.js';
import type { FieldErrors } from '#/types/settings-fields.types.js';

function ModelRow(props: {
  step: StepName;
  choices: readonly PickerItem[];
  model: string;
  error: string | undefined;
  onChange: (model: string) => void;
}) {
  const { step, model } = props;
  const info = STEP_INFO[step];
  const [other, setOther] = useState(false);
  const typed =
    other || !props.choices.some((c) => c.value === model && c.value !== 'custom');

  const id = `model-${step}`;
  const problem = model.trim() === '' ? 'Name a model.' : props.error;

  return (
    <div className="grid content-start gap-1.5">
      <p id={`${id}-label`} className="text-sm font-medium">
        {info.label}
      </p>
      <p id={`${id}-hint`} className="text-xs text-muted">
        {info.hint}
      </p>
      <Picker
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        items={props.choices}
        value={typed ? 'custom' : model}
        error={problem !== undefined}
        onChange={(choice) => {
          if (choice === 'custom') {
            setOther(true);

            return;
          }

          setOther(false);
          props.onChange(choice);
        }}
      />
      {typed ? (
        <TextInput
          id={`${id}-custom`}
          aria-label={`${info.label} model name`}
          value={model}
          error={problem}
          autoComplete="off"
          spellCheck={false}
          placeholder="Model name"
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : null}
      {problem !== undefined ? (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export function ModelFields(props: {
  models: Readonly<Record<string, string | undefined>>;
  errors: FieldErrors;
  onChange: (step: StepName, model: string) => void;
}) {
  const harnesses = useRunsOn();
  const choices = useMemo(() => directorModelChoices(harnesses.data), [harnesses.data]);

  return (
    <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
      {STEP_NAMES.map((step) => (
        <ModelRow
          key={step}
          choices={choices}
          step={step}
          model={props.models[step] ?? ''}
          error={props.errors[`models.director.${step}`]}
          onChange={(model) => props.onChange(step, model)}
        />
      ))}
    </div>
  );
}
