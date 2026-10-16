/**
 * Pins: the Picker groups rows under headings, supports several choices, shows designed
 * loading, error, empty and disabled states, and can be driven by the `choose()` test helper.
 *
 * Why: these are the states a person meets when a list is long, still loading, failed or has
 *   nothing in it. Each must say what is going on in words, not leave a blank dropdown.
 * Depends on: components/ui/picker, helpers/picker-harness, helpers/choose.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Picker } from '#/components/ui/picker.js';
import type { PickerItem } from '#/types/picker.types.js';
import { choose } from '#tests/helpers/choose.js';
import { FRUIT, Harness, trigger } from '#tests/helpers/picker-harness.js';

describe('Picker lists and states', () => {
  it('renders group headings with separators between groups', async () => {
    const user = userEvent.setup();
    const grouped: readonly PickerItem[] = [
      { value: 'a', label: 'Alpha', group: 'Letters' },
      { value: '1', label: 'One', group: 'Numbers' },
      { value: 'b', label: 'Beta', group: 'Letters' },
    ];

    render(<Harness items={grouped} />);

    await user.click(trigger());

    const letters = screen.getByRole('group', { name: 'Letters' });
    expect(
      within(letters)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Alpha', 'Beta']);

    expect(screen.getByRole('group', { name: 'Numbers' })).toBeInTheDocument();
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('supports several choices: stays open, checks rows and counts on the trigger', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Multi() {
      const [value, setValue] = useState<readonly string[]>([]);

      return (
        <Picker
          multiple
          label="Fruit"
          items={FRUIT}
          value={value}
          placeholder="Pick fruit"
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }

    render(<Multi />);
    await user.click(trigger());
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');

    await user.click(screen.getByRole('option', { name: 'Apple' }));
    expect(trigger()).toHaveTextContent('Apple');
    await user.click(screen.getByRole('option', { name: 'Date' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(trigger()).toHaveTextContent('2 selected');
    expect(onChange).toHaveBeenLastCalledWith(['apple', 'date']);
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('option', { name: 'Apple' }));
    expect(onChange).toHaveBeenLastCalledWith(['date']);
  });

  it('shows a spinner and a loading sentence while items arrive', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} loading />);

    expect(trigger()).toHaveAttribute('aria-busy', 'true');
    await user.click(trigger());

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('marks the control invalid and explains a failed load', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} error="Could not load the list." />);

    expect(trigger()).toHaveAttribute('aria-invalid', 'true');
    await user.click(trigger());

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the list.');
  });

  it('says what is missing when there is nothing to choose', async () => {
    const user = userEvent.setup();
    render(<Harness items={[]} emptyText="No connections yet" />);

    await user.click(trigger());

    expect(screen.getByRole('status')).toHaveTextContent('No connections yet');
  });

  it('cannot be opened while disabled', async () => {
    const user = userEvent.setup();
    render(
      <Picker label="Fruit" items={FRUIT} value="" onChange={() => undefined} disabled />,
    );

    await user.click(trigger());

    expect(trigger()).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('the choose() helper drives it like a user', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await choose(user, 'Fruit', 'Blueberry');

    expect(trigger()).toHaveTextContent('Blueberry');
  });
});
