/**
 * Shapes that describe the editable settings fields.
 *
 * Why: Limits and General edit many company settings with the same behaviour (label, hint,
 *   unit, inline error). Describing each field as data keeps the screens short and makes a
 *   new setting a one-line addition instead of new form code.
 *
 * Exports: NumberFieldSpec, TextFieldSpec, SwitchFieldSpec, FieldSpec, FieldGroup, FieldErrors, FieldSetter.
 * Depends on: nothing. Types only.
 */

interface BaseSpec {
  /** Dotted path into the company settings, such as `engine.run_budget.max_usd`. */
  readonly path: string;
  readonly label: string;
  readonly hint?: string;
}

export interface NumberFieldSpec extends BaseSpec {
  readonly kind: 'number';
  /** Shown beside the input, such as `s` or `USD`. */
  readonly unit?: string;
  /** Stored value divided by this is what the user types (1000 shows milliseconds as seconds). */
  readonly scale?: number;
  readonly step?: number;
  /** An empty box means "not set" (the key is left out) instead of "enter a number". */
  readonly optional?: boolean;
}

export interface TextFieldSpec extends BaseSpec {
  readonly kind: 'text';
}

/** An on/off setting; the stored value is a boolean. */
export interface SwitchFieldSpec extends BaseSpec {
  readonly kind: 'switch';
}

export type FieldSpec = NumberFieldSpec | TextFieldSpec | SwitchFieldSpec;

export interface FieldGroup {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly FieldSpec[];
}

/** Sets the draft value at a dotted path. */
export type FieldSetter = (path: string, value: unknown) => void;

/** Validation messages keyed by the dotted path of the field they belong to. */
export type FieldErrors = Readonly<Record<string, string>>;
