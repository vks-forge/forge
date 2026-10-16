/**
 * Pins: the Tooltip names a control on keyboard focus, hides on Escape, and never takes
 * over the trigger's accessible name.
 *
 * Why: icon-only buttons are understood through their tooltip, so keyboard users must get it
 *   too (not only mouse hover), Escape must dismiss it like any transient layer, and the
 *   `aria-label` must stay the name assistive tech reads. It must also work without the
 *   app-wide provider so isolated component tests keep rendering.
 * Depends on: src/components/ui/tooltip. jsdom.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipProvider } from '#/components/ui/tooltip.js';

function Archive(props: { shortcut?: string }) {
  return (
    <Tooltip content="Archive this item" shortcut={props.shortcut}>
      <button type="button" aria-label="Archive">
        x
      </button>
    </Tooltip>
  );
}

describe('Tooltip', () => {
  it('shows the content on keyboard focus of the trigger', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Archive />
      </TooltipProvider>,
    );

    await user.tab();

    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Archive this item');
  });

  it('hides on Escape', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await user.tab();
    await screen.findByRole('tooltip');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('keeps the trigger aria-label and shows the shortcut chip', async () => {
    const user = userEvent.setup();
    render(<Archive shortcut="Esc" />);

    await user.tab();

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect((await screen.findByRole('tooltip')).querySelector('kbd')).toHaveTextContent(
      'Esc',
    );
  });
});
