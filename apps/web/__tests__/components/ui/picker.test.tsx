/**
 * Pins: the Picker opens by click and keyboard, moves and selects with the keys a native
 * select offers, filters long lists, refuses disabled options while saying why, and returns
 * focus to its trigger on Escape.
 *
 * Why: the Picker replaced every native select in the control room (d-0154), so the
 *   keyboard and screen-reader behaviour people got for free from the browser now lives in
 *   our code. A regression here would silently break every filter and form at once.
 * Depends on: components/ui/picker, helpers/picker-harness.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Harness, trigger } from '#tests/helpers/picker-harness.js';

describe('Picker', () => {
  it('opens by click, shows the placeholder, and choosing an option closes it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    expect(trigger()).toHaveTextContent('Pick a fruit');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('option', { name: 'Banana' }));

    expect(onChange).toHaveBeenCalledWith('banana');
    expect(trigger()).toHaveTextContent('Banana');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens from the keyboard and selects with arrows and Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    trigger().focus();
    await user.keyboard('{ArrowDown}');
    const list = await screen.findByRole('listbox', { name: 'Fruit' });

    expect(list).toHaveFocus();
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Apple' }).id,
    );

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('banana');
    expect(trigger()).toHaveFocus();
  });

  it('opens with Enter and Space on the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    trigger().focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.keyboard(' ');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('jumps with Home and End, skipping a disabled last-but-one row', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.keyboard('{End}');
    expect(screen.getByRole('option', { name: 'Date' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await user.keyboard('{ArrowUp}');
    // Cherry is disabled, so the key lands on Blueberry.
    expect(screen.getByRole('option', { name: 'Blueberry' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await user.keyboard('{Home}');
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  it('starts on the chosen option and marks it selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial="banana" />);

    await user.click(trigger());

    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'data-active',
      'true',
    );

    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('typeahead moves to the first match and cycles on a repeated letter', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    await user.keyboard('bl');
    expect(screen.getByRole('option', { name: 'Blueberry' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await user.keyboard('{Escape}');
    await user.click(trigger());
    await user.keyboard('bb');
    expect(screen.getByRole('option', { name: 'Blueberry' })).toHaveAttribute(
      'data-active',
      'true',
    );

    await user.keyboard('{Escape}');
    await user.click(trigger());
    await user.keyboard('d{Enter}');

    expect(trigger()).toHaveTextContent('Date');
  });

  it('filters with the search box, reports no matches, and picks with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);

    await user.click(trigger());
    const search = screen.getByRole('searchbox', { name: 'Search options' });

    expect(search).toHaveFocus();
    await user.keyboard('blu');
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await user.clear(search);
    await user.keyboard('zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matches')).toBeInTheDocument();

    await user.clear(search);
    await user.keyboard('ban{Enter}');
    expect(trigger()).toHaveTextContent('Banana');
  });

  it('turns the search box on by itself for long lists', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 9 }, (_, i) => ({
      value: `v${i}`,
      label: `Item ${i}`,
    }));

    render(<Harness items={many} />);

    await user.click(trigger());

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('does not select a disabled option and shows why it is unavailable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(trigger());
    const cherry = screen.getByRole('option', { name: 'Cherry' });

    expect(cherry).toHaveAttribute('aria-disabled', 'true');
    expect(cherry).toHaveAccessibleDescription('Out of season');
    expect(within(cherry).getByText('Out of season')).toBeInTheDocument();

    await user.click(cherry);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('Escape closes the list and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(trigger());
    expect(await screen.findByRole('listbox')).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });
});
