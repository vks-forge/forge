/**
 * Props and model types of the shared Picker.
 *
 * Why: every dropdown in the control room (board filters, card type, settings, onboarding)
 *   chooses from a list of options that may carry an icon, a description, a badge or a reason
 *   they cannot be chosen right now. One option shape and one prop bag keep each call site to
 *   a list plus a value, and let the single-choice and multiple-choice modes share a
 *   component while TypeScript still ties `value` and `onChange` to the mode in use.
 *
 * Exports: PickerItem, PickerSize, PickerProps, PickerSection.
 * Depends on: react. Types only.
 */

import type { ReactNode } from 'react';

export interface PickerItem {
  readonly value: string;
  /** The words in the list and, once chosen, on the trigger. Also what typeahead matches. */
  readonly label: string;
  /** A second line under the label. */
  readonly description?: string | undefined;
  readonly icon?: ReactNode | undefined;
  /** A short tag at the end of the row, such as "default" or "new". */
  readonly badge?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Why a disabled item cannot be chosen; shown under its label instead of the description. */
  readonly disabledReason?: string | undefined;
  /** Items sharing a group name sit under one heading, in order of first appearance. */
  readonly group?: string | undefined;
}

export type PickerSize = 'sm' | 'md';

/** A run of items under one optional heading, as rendered. */
export interface PickerSection {
  readonly group: string | undefined;
  readonly items: readonly PickerItem[];
}

interface PickerCommonProps {
  readonly items: readonly PickerItem[];
  readonly placeholder?: string | undefined;
  /** The accessible name, when no visible label points at the trigger. */
  readonly label?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  /** DOM id of the trigger, so a `<label htmlFor>` can name it. */
  readonly id?: string | undefined;
  readonly 'aria-describedby'?: string | undefined;
  /** Shows a search box; defaults to on when there are more than 8 items. */
  readonly searchable?: boolean | undefined;
  readonly size?: PickerSize | undefined;
  readonly disabled?: boolean | undefined;
  /** Items are still arriving: the trigger shows a spinner and the list says so. */
  readonly loading?: boolean | undefined;
  /** Marks the control invalid; a string is also shown in the list while it has no items. */
  readonly error?: string | boolean | undefined;
  readonly emptyText?: string | undefined;
  readonly className?: string | undefined;
}

export interface PickerSingleProps extends PickerCommonProps {
  readonly multiple?: false | undefined;
  /** The chosen item's value, or '' for none. */
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export interface PickerMultipleProps extends PickerCommonProps {
  readonly multiple: true;
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
}

export type PickerProps = PickerSingleProps | PickerMultipleProps;
