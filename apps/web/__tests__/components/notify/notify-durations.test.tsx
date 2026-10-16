/**
 * Pins: how long each tone stays, and when the clock stops: error never expires, success and warning do, loading waits to be updated, and hovering, focus or a hidden tab hold a message still.
 *
 * Why: a failure that vanished while the user looked away, or a message that expired under the cursor
 *   or in a background tab, would be missed. Fake timers drive the real provider and viewport.
 * Depends on: components/notify/notify-provider, state/notify/*, helpers/render-notify.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyStore } from '#/state/notify/notify-store.js';
import type { NotifyConfigInput } from '#/types/notify.types.js';
import { mountNotify, notifyIds as ids } from '#tests/helpers/render-notify.js';

const mount = (config: NotifyConfigInput = {}) => mountNotify(null, config);
const region = () => screen.getByRole('region', { name: 'Notifications' });

describe('durations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('success leaves after 4 s, warning after 6 s, error never', () => {
    mount();
    act(() => {
      notifyStore.success('ok', { id: 'ok' });
      notifyStore.warning('careful', { id: 'warn' });
      notifyStore.error('bad', { id: 'bad' });
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(ids()).toEqual(['warn', 'bad']);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(ids()).toEqual(['bad']);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(ids()).toEqual(['bad']);
  });

  it('loading stays until updated, then takes the new tone lifetime', () => {
    mount();
    act(() => {
      notifyStore.loading('Working', { id: 'w' });
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(ids()).toEqual(['w']);

    act(() => {
      notifyStore.update('w', { tone: 'success', title: 'Done' });
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(ids()).toEqual([]);
  });

  it('honours the provider defaults and a per-call duration', () => {
    mount({ defaultDuration: { success: 1000, error: 2000 } });
    act(() => {
      notifyStore.success('quick', { id: 'quick' });
      notifyStore.error('timed', { id: 'timed' });
      notifyStore.info('custom', { id: 'custom', duration: 500 });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(ids()).toEqual(['quick', 'timed']);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(ids()).toEqual([]);
  });

  it('pauses while hovered and resumes with the time that was left', () => {
    mount();
    act(() => {
      notifyStore.success('hold me', { id: 'h' });
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    fireEvent.mouseEnter(region());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(ids()).toEqual(['h']);

    fireEvent.mouseLeave(region());
    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(ids()).toEqual(['h']);

    act(() => {
      vi.advanceTimersByTime(2);
    });

    expect(ids()).toEqual([]);
  });

  it('pauses while focus is inside the stack', () => {
    mount();
    act(() => {
      notifyStore.success('read me', {
        id: 'f',
        action: { label: 'Undo', onClick: () => false },
      });
    });

    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(ids()).toEqual(['f']);
  });

  it('pauses while the tab is hidden', () => {
    mount();
    act(() => {
      notifyStore.success('unseen', { id: 'u' });
    });

    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(ids()).toEqual(['u']);

    state.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(ids()).toEqual([]);
  });
});
