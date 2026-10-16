/**
 * AddStepForm: name and instructions for a custom Director step.
 *
 * Why: a custom step is a Director call the owner defines in words ("check the migration
 *   plan against our naming rules"), so it needs exactly two things and refuses to be added
 *   without them: a name to show in the list and instructions to run. Saying what is missing,
 *   next to the field, is kinder than a disabled button that gives no reason. Escape or Cancel
 *   closes the form without adding anything.
 *
 * Exports: AddStepForm.
 * Depends on: react, components/settings/form-field, components/ui/button, components/ui/field,
 *   domain/director-flow-edit.
 */

import { useState } from 'react';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { MAX_LABEL } from '#/domain/director-flow-edit.js';

export function AddStepForm(props: {
  onAdd: (input: { name: string; instructions: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [tried, setTried] = useState(false);
  const nameError =
    name.trim() === '' || name.length > MAX_LABEL
      ? `Give the step a name of 1 to ${MAX_LABEL} characters.`
      : undefined;

  const instructionsError =
    instructions.trim() === '' ? 'Say what the Director should do.' : undefined;

  return (
    <form
      aria-label="Add a custom step"
      className="grid gap-4 rounded-lg border border-line bg-surface p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          props.onCancel();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);

        if (nameError === undefined && instructionsError === undefined) {
          props.onAdd({ name, instructions });
        }
      }}
    >
      <FormField
        id="new-step-name"
        label="Step name"
        error={tried ? nameError : undefined}
      >
        <TextInput
          id="new-step-name"
          value={name}
          autoComplete="off"
          error={tried ? nameError : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField
        id="new-step-instructions"
        label="Instructions"
        hint="Runs as one Director step, after the steps above it."
        error={tried ? instructionsError : undefined}
      >
        <textarea
          id="new-step-instructions"
          rows={4}
          value={instructions}
          aria-invalid={tried && instructionsError ? true : undefined}
          className={`${INPUT_CLASS} py-2`}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          Add step
        </Button>
        <Button onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
