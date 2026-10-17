/**
 * Pins: the Tooltip names a control on keyboard focus, hides on Escape, and never takes
 * over the trigger's accessible name.
 *
 * Why: icon-only buttons are understood through their tooltip, so keyboard users must get it
 *   too (not only mouse hover), Escape must dismiss it like any transient layer, and the
 *   `aria-label` must stay the name assistive tech reads. A tooltip must never stick: it has
 *   to leave the DOM (not just flip a data attribute) when the pointer leaves, on press,
 *   blur, Escape, scroll, tab hide, or when its trigger moves or unmounts, because the flow
 *   editor's move buttons reorder rows under the pointer. A mouse click must not count as
 *   keyboard focus and open it. It must also work without the app-wide provider so isolated
 *   component tests keep rendering.
 * Depends on: src/components/ui/tooltip, src/theme/app.css. jsdom.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

  it('shows on hover and hides when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(<Archive />);

    await user.hover(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('tooltip');
    await user.unhover(screen.getByRole('button', { name: 'Archive' }));
    // jsdom has no layout (every rect is 0x0 at the origin), so move the pointer clear of
    // the hover grace area the way a real mouse travelling away would.
    fireEvent.pointerMove(document.body, { clientX: 500, clientY: 500 });

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('hides after a click once the pointer moves away', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    const button = screen.getByRole('button', { name: 'Archive' });
    await user.hover(button);
    await screen.findByRole('tooltip');

    await user.click(button);
    await user.unhover(button);

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('is gone after clicking a trigger that reorders itself under the pointer', async () => {
    function Reorder() {
      const [flip, setFlip] = useState(false);
      const move = (
        <Tooltip content="Move down">
          <button type="button" aria-label="Move" onClick={() => setFlip(!flip)}>
            m
          </button>
        </Tooltip>
      );

      return (
        <ul>
          {flip ? <li>other</li> : null}
          <li>{move}</li>
          {flip ? null : <li>other</li>}
        </ul>
      );
    }

    const user = userEvent.setup();
    render(<Reorder />);
    const button = screen.getByRole('button', { name: 'Move' });
    await user.hover(button);
    await screen.findByRole('tooltip');

    await user.click(button);
    await user.pointer({ target: document.body });

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('removes the tooltip from the DOM when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    const button = screen.getByRole('button', { name: 'Archive' });
    await user.hover(button);
    await screen.findByRole('tooltip');

    await user.unhover(button);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull();
  });

  it('does not open from the focus a mouse click gives the trigger', async () => {
    const user = userEvent.setup();
    render(<Archive />);

    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides when the trigger loses focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Archive />
        <button type="button">next</button>
      </>,
    );

    await user.tab();
    await screen.findByRole('tooltip');

    await user.tab();

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides on scroll', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await user.tab();
    await screen.findByRole('tooltip');

    fireEvent.scroll(window);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides when the tab is hidden', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await user.tab();
    await screen.findByRole('tooltip');

    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    spy.mockRestore();

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides when the pointer moves to anything else without a leave event', async () => {
    const user = userEvent.setup();
    render(<Archive />);
    await user.hover(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('tooltip');

    fireEvent.pointerMove(document.body);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('leaves no tooltip when the trigger is removed while open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Archive />);
    await user.hover(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('tooltip');

    rerender(<p>gone</p>);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('leaves no tooltip when the trigger is detached but its Tooltip stays mounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Archive />);
    const button = screen.getByRole('button', { name: 'Archive' });
    await user.hover(button);
    await screen.findByRole('tooltip');

    const home = button.parentElement as HTMLElement;
    document.createElement('div').append(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    vi.useRealTimers();

    expect(screen.queryByRole('tooltip')).toBeNull();
    home.append(button);
  });

  it('keeps the child own handlers', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onBlur = vi.fn();
    render(
      <Tooltip content="Go">
        <button type="button" onClick={onClick} onBlur={onBlur}>
          go
        </button>
      </Tooltip>,
    );

    await user.click(screen.getByRole('button', { name: 'go' }));
    await user.tab();

    expect(onClick).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('only animates with keyframes that the stylesheet defines', () => {
    const css = readFileSync(
      resolve(import.meta.dirname, '../../../src/theme/app.css'),
      'utf8',
    );

    const source = readFileSync(
      resolve(import.meta.dirname, '../../../src/components/ui/tooltip.tsx'),
      'utf8',
    );

    const used = [...source.matchAll(/animate-\[([a-z-]+)_/g)].map((m) => m[1]);

    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect(css).toContain(`@keyframes ${name}`);
    }
  });
});
