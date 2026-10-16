/**
 * Pins: useNotifyTask: one polled job maps to exactly one card, however often it re-renders or re-mounts; it resolves when the job ends, ignores stale finished jobs and stays closed once the user closed it.
 *
 * Why: a page polling a server job calls the hook on every render. Without idempotence each poll
 *   would add a card, a re-entered page would duplicate it, and a card the user closed would keep
 *   coming back.
 * Depends on: components/notify/notify-provider, state/notify/*, helpers/render-notify.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNotifyStore } from '#/state/notify/notify-store.js';
import { useNotifyTask } from '#/state/notify/use-notify-task.js';
import type { NotifyTaskState } from '#/types/notify.types.js';
import { mountNotify } from '#tests/helpers/render-notify.js';

const items = () => useNotifyStore.getState().items;

function Poller(props: { state: NotifyTaskState | null }) {
  useNotifyTask('compat:demo', props.state);

  return null;
}

const running = (over: Partial<NotifyTaskState> = {}): NotifyTaskState => ({
  status: 'running',
  title: 'Checking compatibility',
  ...over,
});

describe('useNotifyTask', () => {
  it('creates one card, updates it as the job advances, and resolves it at the end', () => {
    const view = mountNotify(
      <Poller state={running({ progress: { value: 1, max: 3 } })} />,
    );

    expect(items()).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

    const next = (state: NotifyTaskState) => view.update(<Poller state={state} />);

    next(running({ progress: { value: 2, max: 3 } }));

    expect(items()).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');

    next({
      status: 'succeeded',
      title: 'Checking compatibility',
      successTitle: 'All passed',
    });

    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ tone: 'success', title: 'All passed' });
  });

  it('does not duplicate when the page re-mounts while the job still runs', () => {
    const first = mountNotify(<Poller state={running()} />);

    first.unmount();
    mountNotify(<Poller state={running({ progress: { value: 2, max: 3 } })} />);

    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ progress: { value: 2, max: 3 } });
  });

  it('ignores a job that had already failed when the page opened', () => {
    mountNotify(<Poller state={{ status: 'failed', title: 'Checks failed' }} />);

    expect(items()).toHaveLength(0);
  });

  it('resolves a card that was showing progress when the job fails', () => {
    const view = mountNotify(<Poller state={running()} />);

    view.update(
      <Poller
        state={{ status: 'failed', title: 'Checking', failTitle: '2 checks failed' }}
      />,
    );

    expect(items()[0]).toMatchObject({ tone: 'error', title: '2 checks failed' });
  });

  it('stays closed once the user dismissed the running card', () => {
    const view = mountNotify(<Poller state={running()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(items()).toHaveLength(0);

    view.update(<Poller state={running({ progress: { value: 2, max: 3 } })} />);

    expect(items()).toHaveLength(0);
  });

  it('ignores a job that was already finished when the page opened', () => {
    mountNotify(<Poller state={{ status: 'succeeded', title: 'Old news' }} />);

    expect(items()).toHaveLength(0);
  });
});
