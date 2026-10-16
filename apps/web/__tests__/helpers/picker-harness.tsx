/**
 * PickerHarness and FRUIT: a stateful Picker with a small fixture list, for Picker tests.
 *
 * Why: a Picker is controlled, so every behaviour test needs something to hold its value.
 *   One harness keeps the tests about the Picker and not about wiring, and the fixture covers
 *   the row kinds that matter (plain, description, badge, disabled with a reason).
 *
 * Exports: FRUIT, Harness, trigger().
 * Depends on: components/ui/picker, @testing-library/react.
 */

import { screen } from '@testing-library/react';
import { useState } from 'react';
import { Picker } from '#/components/ui/picker.js';
import type { PickerItem } from '#/types/picker.types.js';

export const FRUIT: readonly PickerItem[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana', description: 'Yellow' },
  { value: 'blueberry', label: 'Blueberry', badge: 'new' },
  { value: 'cherry', label: 'Cherry', disabled: true, disabledReason: 'Out of season' },
  { value: 'date', label: 'Date' },
];

export function Harness(props: {
  items?: readonly PickerItem[];
  initial?: string;
  onChange?: (value: string) => void;
  searchable?: boolean;
  loading?: boolean;
  error?: string | boolean;
  emptyText?: string;
}) {
  const [value, setValue] = useState(props.initial ?? '');

  return (
    <>
      <button type="button">before</button>
      <Picker
        label="Fruit"
        items={props.items ?? FRUIT}
        value={value}
        placeholder="Pick a fruit"
        searchable={props.searchable}
        loading={props.loading}
        error={props.error}
        emptyText={props.emptyText}
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
      />
    </>
  );
}

export const trigger = () => screen.getByRole('combobox', { name: 'Fruit' });
