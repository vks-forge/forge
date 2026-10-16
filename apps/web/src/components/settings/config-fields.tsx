/**
 * ConfigFields: renders a group of company-setting fields from their descriptors.
 *
 * Why: Limits and General hold about thirty dials between them. Rendering each from a
 *   descriptor gives every one the same label, hint, unit and inline error without thirty
 *   hand-written inputs, and keeps the number-in-the-person's-unit logic (seconds for a value
 *   stored in milliseconds) in one place. An emptied number field becomes NaN in the draft,
 *   which the schema rejects with "Enter a number", so a blank can never be saved as 0.
 *
 * Exports: ConfigFields.
 * Depends on: domain/config-path, components/settings/form-field, types/settings-fields.types.
 */

import type { ForgeConfig } from '@forge/core';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { getAt } from '#/domain/config-path.js';
import type { FieldErrors, FieldSpec } from '#/types/settings-fields.types.js';

const idOf = (path: string): string => `field-${path.replaceAll('.', '-')}`;

/** Float noise from 0.1 * 60000 must not reach the server. */
const tidy = (n: number): number => Math.round(n * 1e6) / 1e6;

function Field(props: {
  spec: FieldSpec;
  config: ForgeConfig;
  error: string | undefined;
  onChange: (path: string, value: unknown) => void;
}) {
  const { spec, config, error } = props;
  const id = idOf(spec.path);
  const raw = getAt(config, spec.path);

  if (spec.kind === 'text') {
    return (
      <FormField id={id} label={spec.label} hint={spec.hint} error={error}>
        <TextInput
          id={id}
          hasHint={spec.hint !== undefined}
          value={typeof raw === 'string' ? raw : ''}
          error={error}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => props.onChange(spec.path, e.target.value)}
        />
      </FormField>
    );
  }

  const scale = spec.scale ?? 1;
  const shown = typeof raw === 'number' && !Number.isNaN(raw) ? tidy(raw / scale) : '';

  return (
    <FormField id={id} label={spec.label} hint={spec.hint} error={error}>
      <div className="flex items-center gap-2">
        <TextInput
          id={id}
          hasHint={spec.hint !== undefined}
          type="number"
          inputMode="decimal"
          step={spec.step ?? 'any'}
          value={shown}
          error={error}
          className="max-w-40"
          onChange={(e) =>
            props.onChange(
              spec.path,
              e.target.value === '' ? Number.NaN : tidy(Number(e.target.value) * scale),
            )
          }
        />
        {spec.unit ? <span className="text-sm text-muted">{spec.unit}</span> : null}
      </div>
    </FormField>
  );
}

export function ConfigFields(props: {
  fields: readonly FieldSpec[];
  config: ForgeConfig;
  errors: FieldErrors;
  onChange: (path: string, value: unknown) => void;
}) {
  return (
    <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
      {props.fields.map((spec) => (
        <Field
          key={spec.path}
          spec={spec}
          config={props.config}
          error={props.errors[spec.path]}
          onChange={props.onChange}
        />
      ))}
    </div>
  );
}
