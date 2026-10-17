/**
 * Pins: ScrollArea renders the real scroll element, hands it to a ref, and wakes its
 * scrollbar while scrolling.
 *
 * Why: virtualizers and scroll restoration need the actual element that scrolls, and a
 *   scrollbar that never appears (or one that shifts layout) makes long threads and drawers
 *   unusable. The axis choice decides which direction the box may scroll.
 * Depends on: src/components/ui/scroll-area. jsdom.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ScrollArea } from '#/components/ui/scroll-area.js';

describe('ScrollArea', () => {
  it('forwards its ref to the scrolling element and keeps native props', () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <ScrollArea ref={ref} role="log" aria-label="Messages">
        <p>row</p>
      </ScrollArea>,
    );

    expect(ref.current).toBe(screen.getByRole('log', { name: 'Messages' }));
    expect(ref.current).toHaveClass('scroll-area', 'overflow-y-auto');
  });

  it('scrolls on the chosen axis only', () => {
    render(<ScrollArea orientation="horizontal" data-testid="box" />);

    expect(screen.getByTestId('box')).toHaveClass('overflow-x-auto', 'overflow-y-hidden');
  });

  it('marks itself as scrolling for a moment and calls the caller handler', () => {
    vi.useFakeTimers();
    const onScroll = vi.fn();

    render(<ScrollArea data-testid="box" onScroll={onScroll} />);
    const box = screen.getByTestId('box');

    fireEvent.scroll(box);

    expect(box).toHaveAttribute('data-scrolling');
    expect(onScroll).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(box).not.toHaveAttribute('data-scrolling');
    vi.useRealTimers();
  });
});
