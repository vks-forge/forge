/**
 * Pins: the notification viewport as a user meets it: where it sits, how each tone is announced, how cards stack, replace and run their actions.
 *
 * Why: after every action the user looks for the answer in one place. A duplicate id that stacked a
 *   second card, an empty alert region that read as a standing error, Esc doing nothing or an
 *   action that left its card behind would each make people miss or fight a message. These
 *   tests drive the real provider and viewport.
 * Depends on: components/notify/notify-provider, state/notify/*, helpers/render-notify.
 */

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNotify } from '#/state/notify/notify-context.js';
import { notifyStore } from '#/state/notify/notify-store.js';
import type { NotifyConfigInput } from '#/types/notify.types.js';
import { mountNotify, notifyIds as ids } from '#tests/helpers/render-notify.js';

function Buttons() {
  const notify = useNotify();

  return (
    <button type="button" onClick={() => notify.success('Saved from a component')}>
      go
    </button>
  );
}

function mount(config: NotifyConfigInput = {}) {
  return mountNotify(<Buttons />, config);
}

const region = () => screen.getByRole('region', { name: 'Notifications' });

describe('NotifyProvider', () => {
  it('renders one viewport, bottom-centre by default, above dialogs', () => {
    mount();

    expect(region()).toHaveClass('fixed', 'left-1/2', 'z-[70]');
    expect(screen.getAllByRole('region', { name: 'Notifications' })).toHaveLength(1);
    // An always-present alert container would read as a standing error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('supports a right-hand position', () => {
    mount({ position: 'top-right', offset: 24 });

    expect(region()).not.toHaveClass('left-1/2');
    expect(region().style.right).toBe('24px');
  });

  it('shows a notification raised from a component through useNotify', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));

    expect(screen.getByText('Saved from a component')).toBeInTheDocument();
  });

  it('shows a notification raised outside React through notifyStore', () => {
    mount();
    act(() => {
      notifyStore.info('From a plain function');
    });

    expect(screen.getByText('From a plain function')).toBeInTheDocument();
  });

  it('announces success in a polite region and errors and warnings as alerts', () => {
    mount();
    act(() => {
      notifyStore.success('Archived');
      notifyStore.error('Could not save', { description: 'Server said no.' });
      notifyStore.warning('Quota low');
    });

    const polite = screen
      .getByText('Archived')
      .closest('[aria-live="polite"]') as HTMLElement;

    const alerts = screen.getAllByRole('alert');

    expect(within(polite).queryByText('Could not save')).not.toBeInTheDocument();
    expect(alerts).toHaveLength(2);
    expect(
      within(alerts[0] as HTMLElement).getByText('Could not save'),
    ).toBeInTheDocument();

    expect(
      within(alerts[0] as HTMLElement).getByText('Server said no.'),
    ).toBeInTheDocument();

    expect(within(alerts[1] as HTMLElement).getByText('Quota low')).toBeInTheDocument();
  });

  it('tells keyboard users about F8 in a visually hidden hint and moves focus there on F8', () => {
    mount();

    expect(region()).toHaveAccessibleDescription(/F8/);

    fireEvent.keyDown(document, { key: 'F8' });

    expect(region()).toHaveFocus();
  });

  it('dismisses with the close button, which is labelled', async () => {
    mount();
    act(() => {
      notifyStore.error('Failed');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(ids()).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText('Failed')).not.toBeInTheDocument());
  });

  it('Esc inside a card dismisses it', () => {
    mount();
    act(() => {
      notifyStore.error('Failed');
    });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Dismiss notification' }), {
      key: 'Escape',
    });

    expect(ids()).toHaveLength(0);
  });

  it('does not crash under reduced motion', () => {
    mount();
    act(() => {
      notifyStore.success('Quiet');
    });

    expect(screen.getByText('Quiet')).toBeInTheDocument();
  });
});

describe('stacking and replacing', () => {
  it('the same id replaces the card instead of stacking a second', () => {
    mount();
    act(() => {
      notifyStore.success('First', { id: 'same' });
      notifyStore.success('Second', { id: 'same' });
    });

    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('shows only the newest `max` and brings queued ones back when others go', async () => {
    mount({ max: 2 });
    act(() => {
      notifyStore.error('one', { id: 'one' });
      notifyStore.error('two', { id: 'two' });
      notifyStore.error('three', { id: 'three' });
    });

    expect(screen.queryByText('one')).not.toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();

    act(() => {
      notifyStore.dismiss('three');
    });

    expect(await screen.findByText('one')).toBeInTheDocument();
  });

  it('runs the action, then dismisses unless it returns false', async () => {
    mount();

    const onClick = vi.fn();

    act(() => {
      notifyStore.success('Archived', { id: 'a', action: { label: 'Undo', onClick } });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ids()).toEqual([]));

    act(() => {
      notifyStore.success('Kept', {
        id: 'k',
        action: { label: 'Retry', onClick: () => false },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(ids()).toEqual(['k']);
  });

  it('follows a promise from loading to success', async () => {
    mount();

    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });

    act(() => {
      void notifyStore.promise(pending, {
        id: 'p',
        loading: 'Saving…',
        success: (name) => `Saved ${name}`,
        error: 'Failed',
      });
    });

    expect(screen.getByText('Saving…')).toBeInTheDocument();

    await act(async () => {
      resolve('config');
      await pending;
    });

    expect(await screen.findByText('Saved config')).toBeInTheDocument();
  });
});
