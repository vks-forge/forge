/**
 * Pins: task notifications: a labelled progressbar, live step status with a bounded list, Cancel and View actions, the turn into success or error, and staying pinned when other messages arrive.
 *
 * Why: the compatibility checks keep running after the user leaves the page. The card must show real
 *   progress, say which step failed, never be pushed out by other messages while it runs, and
 *   become a plain success or a persistent error when the job ends.
 * Depends on: components/notify/notify-provider, state/notify/*, helpers/render-notify.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { notifyStore, useNotifyStore } from '#/state/notify/notify-store.js';
import type { NotifyStep } from '#/types/notify.types.js';
import { mountNotify } from '#tests/helpers/render-notify.js';

const items = () => useNotifyStore.getState().items;

function mount(children: ReactNode = null, max?: number) {
  return mountNotify(children, max ? { max } : {});
}

describe('task progress', () => {
  it('shows a determinate bar with value, max and a label', () => {
    mount();
    act(() => {
      notifyStore.task({
        id: 't',
        title: 'Checking compatibility',
        progress: { value: 3, max: 7, label: '3 of 7 checks' },
      });
    });

    const bar = screen.getByRole('progressbar', {
      name: 'Checking compatibility progress',
    });

    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '7');
    expect(bar).toHaveAttribute('aria-valuetext', '3 of 7 checks');
    expect(screen.getByText('3 of 7 checks')).toBeInTheDocument();
  });

  it('moves the bar on update without adding a card', () => {
    mount();

    const task = notifyStore.task({
      id: 't',
      title: 'Checking',
      progress: { value: 1, max: 4 },
    });

    act(() => {
      task.update({ progress: { value: 3, max: 4 } });
    });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByText('3 of 4')).toBeInTheDocument();
    expect(items()).toHaveLength(1);
  });

  it('is indeterminate (no value) when the total is unknown, even under reduced motion', () => {
    mount();
    act(() => {
      notifyStore.task({ id: 't', title: 'Working', progress: {} });
    });

    const bar = screen.getByRole('progressbar');

    expect(bar).not.toHaveAttribute('aria-valuenow');
  });

  it('defaults max to 100 and shows a percentage', () => {
    mount();
    act(() => {
      notifyStore.task({ id: 't', title: 'Working', progress: { value: 42 } });
    });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('keeps progress out of the live regions, so ticks are not read out', () => {
    mount();
    act(() => {
      notifyStore.task({ id: 't', title: 'Working', progress: { value: 1, max: 4 } });
    });

    expect(screen.getByRole('progressbar').closest('[aria-live="off"]')).not.toBeNull();
  });

  it('shows Cancel while running and calls onCancel once', () => {
    mount();

    const onCancel = vi.fn();

    act(() => {
      notifyStore.task({ id: 't', title: 'Working', onCancel });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  });

  it('keeps the card after a View action on a running task', async () => {
    mount();

    const onClick = vi.fn();

    act(() => {
      notifyStore.task({ id: 't', title: 'Working', action: { label: 'View', onClick } });
    });

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(onClick).toHaveBeenCalled();
    expect(items()).toHaveLength(1);
  });
});

describe('task steps', () => {
  const steps = (...status: NotifyStep['status'][]): NotifyStep[] =>
    status.map((s, index) => ({ label: `Check ${index + 1}`, status: s }));

  it('collapses to the current step and a count, and expands to all of them', () => {
    mount();
    act(() => {
      notifyStore.task({
        id: 't',
        title: 'Checking',
        steps: steps('pass', 'running', 'pending'),
      });
    });

    expect(screen.getByText('Check 2')).toBeInTheDocument();
    expect(screen.queryByText('Check 1')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 steps')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Show steps/ });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    const list = screen.getByRole('list');

    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Passed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide steps/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('bounds the list height and scrolls beyond five rows', () => {
    mount();
    act(() => {
      notifyStore.task({
        id: 't',
        title: 'Checking',
        steps: steps('pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'running'),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /Show steps/ }));

    const list = screen.getByRole('list');

    expect(list).toHaveClass('max-h-40', 'overflow-y-auto', 'overflow-x-hidden');

    for (const label of within(list).getAllByText(/Check/)) {
      expect(label).not.toHaveClass('truncate');
      expect(label).toHaveClass('break-words');
    }
  });

  it('updates a step status live', () => {
    mount();

    const task = notifyStore.task({
      id: 't',
      title: 'Checking',
      steps: steps('running', 'pending'),
    });

    act(() => {
      task.update({ steps: steps('pass', 'running') });
    });

    expect(screen.getByText('Check 2')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 steps')).toBeInTheDocument();
  });

  it('announces a failed step by name', () => {
    mount();
    act(() => {
      notifyStore.task({ id: 't', title: 'Checking', steps: steps('fail', 'running') });
    });

    expect(screen.getByText('Step failed: Check 1')).toBeInTheDocument();
  });
});

describe('task finishing', () => {
  it('succeed becomes a success card without progress, then leaves on its own', () => {
    vi.useFakeTimers();
    mount();

    const task = notifyStore.task({
      id: 't',
      title: 'Checking',
      progress: { value: 7, max: 7 },
    });

    act(() => {
      task.succeed('All 7 checks passed');
    });

    expect(screen.getByText('All 7 checks passed')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(items()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('fail becomes a persistent error in the assertive region', () => {
    vi.useFakeTimers();
    mount();

    const task = notifyStore.task({ id: 't', title: 'Checking' });

    act(() => {
      task.fail('2 checks failed');
    });

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(
      within(screen.getByRole('alert')).getByText('2 checks failed'),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('is not pushed out by max while running', () => {
    mount(null, 2);
    act(() => {
      notifyStore.task({ id: 't', title: 'Long job' });
      for (const name of ['a', 'b', 'c', 'd']) {
        notifyStore.error(name, { id: name });
      }
    });

    expect(screen.getByText('Long job')).toBeInTheDocument();
    expect(screen.queryByText('a')).not.toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
  });
});
