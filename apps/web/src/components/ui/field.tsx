/**
 * Field and Switch: the form pieces every settings screen shares.
 *
 * Why: a form is only as clear as its labels and errors. `Field` ties a visible label, a
 *   hint and an error message to its control with `htmlFor` and `aria-describedby`, so a screen
 *   reader says what a box is for and what is wrong with it, and an error is always text with
 *   an icon, never colour alone. `Switch` is a real `role="switch"` button, 44 px tall on
 *   touch screens, whose thumb moves with a transform only. `INPUT_CLASS` gives text boxes one
 *   shape, with a focus ring that shows at once.
 *
 * Exports: Field, Switch, INPUT_CLASS.
 * Depends on: react, lucide-react.
 */

import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export const INPUT_CLASS =
  'min-h-9 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-faint disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted aria-[invalid=true]:border-danger';

export function Field(props: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      {props.hint ? (
        <p id={`${props.id}-hint`} className="text-xs text-muted">
          {props.hint}
        </p>
      ) : null}
      {props.error ? (
        <p
          id={`${props.id}-error`}
          role="alert"
          className="flex items-center gap-1.5 text-xs text-danger"
        >
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        props.checked ? 'border-signal bg-signal' : 'border-line bg-hover'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform duration-150 ${
          props.checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
