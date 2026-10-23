/**
 * Pins: the "Close all" button on the notification stack: when it shows, what it closes, where focus goes and what is announced.
 *
 * Why: after a burst of results (several saves, a failed batch) closing cards one by one is
 *   tedious, but a bulk close that also killed a running job's progress card or a pinned notice
 *   would hide something the user still needs. These tests drive the real viewport.
 * Depends on: components/notify/notify-provider, state/notify/notify-store, helpers/render-notify.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notifyStore } from '#/state/notify/notify-store.js';
import { mountNotify, notifyIds as ids } from '#tests/helpers/render-notify.js';

const closeAll = () => screen.queryByRole('button', { name: /close all/i });

describe('NotifyViewport close all', () => {
  it('is hidden with one closable card and shown from two', () => {
    mountNotify();
    act(() => void notifyStore.error('one', { id: 'one' }));
    act(() => void notifyStore.task({ id: 'job', title: 'Working' }));

    expect(closeAll()).not.toBeInTheDocument();

    act(() => void notifyStore.error('two', { id: 'two' }));

    expect(closeAll()).toHaveAccessibleName('Close all 2 notifications');
  });

  it('closes only dismissible cards, keeps focus in the stack and announces the count', () => {
    mountNotify();
    act(() => void notifyStore.error('a', { id: 'a' }));
    act(() => void notifyStore.error('b', { id: 'b' }));
    act(() => void notifyStore.error('pinned', { id: 'pinned', dismissible: false }));
    act(() => void notifyStore.task({ id: 'job', title: 'Working' }));

    fireEvent.click(closeAll() as HTMLElement);

    expect(ids()).toEqual(['pinned', 'job']);
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveFocus();
    expect(screen.getByText('Closed 2 notifications')).toBeInTheDocument();
    expect(closeAll()).not.toBeInTheDocument();
  });
});
