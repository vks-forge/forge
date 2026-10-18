/**
 * Pins: the Director sign-off setting: a project sees the company's ceiling as the highest option
 * it may pick and the options above it greyed with the reason, and tier C is never an option.
 *
 * Why: a project may only lower how far the Director signs, never raise it past the company's
 *   choice (the server refuses it). Showing the higher options greyed, with why, stops the owner
 *   from finding that out by a refused save; and tier C must not even look like a choice.
 * Depends on: components/director/rules-fields, components/ui/tooltip. jsdom.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignOffField } from '#/components/director/rules-fields.js';

describe('SignOffField', () => {
  it('greys the options above the company ceiling and says why', async () => {
    const user = userEvent.setup();

    render(<SignOffField value="A" ceiling="A" onChange={() => undefined} />);
    await user.click(screen.getByRole('combobox', { name: 'Director sign-off' }));

    const above = await screen.findByRole('option', { name: /Up to tier B/ });

    expect(above).toHaveAttribute('aria-disabled', 'true');
    expect(above).toHaveTextContent('The company setting does not allow this.');
    expect(screen.getByRole('option', { name: /Tier A only/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('reports the tier chosen and offers every option when there is no ceiling', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<SignOffField value="B" onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Director sign-off' }));

    expect(await screen.findAllByRole('option')).toHaveLength(3);

    await user.click(screen.getByRole('option', { name: /Never/ }));

    expect(onChange).toHaveBeenCalledWith('none');
  });
});
