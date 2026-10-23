/**
 * Pins: the needs-you alert is absent when nothing waits, says what is asked with a count when
 * several wait, opens a modal that lists every item (newest first) with its own content and
 * actions, closes on Escape with focus back on Open without answering anything, can be reopened,
 * and closes itself with the alert gone once the last item is settled.
 *
 * Why: the owner's decisions (sign-off, approvals, failures) moved out of an inline block into
 *   this modal. If the alert showed with nothing waiting it would cry wolf; if closing lost the
 *   item or focus, a keyboard user would be stranded; if the modal stayed open over a settled
 *   item, the owner would be looking at something already answered.
 * Depends on: components/work/needs-you-pill, types/needs-you-dock.types.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NeedsYouPill } from '#/components/work/needs-you-pill.js';
import type { DockView } from '#/types/needs-you-dock.types.js';

const view = (key: string, over: Partial<DockView> = {}): DockView => ({
  key,
  kind: 'ticket_signoff',
  title: `Item ${key}`,
  reasons: [],
  ...over,
});

/** Settles an item the way an answered escalation does: it leaves the list. */
function Harness(props: { initial: readonly DockView[]; online?: boolean }) {
  const [views, setViews] = useState(props.initial);
  const withActions = views.map((item): DockView => ({
    ...item,
    body: (
      <button
        type="button"
        onClick={() => setViews((list) => list.filter((v) => v.key !== item.key))}
      >
        Answer {item.key}
      </button>
    ),
  }));

  return <NeedsYouPill views={withActions} online={props.online ?? true} />;
}

describe('NeedsYouPill', () => {
  it('draws nothing when nothing waits', () => {
    render(<Harness initial={[]} />);

    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByText(/Needs your/)).toBeNull();
  });

  it('says what is asked and adds the count when several wait', () => {
    const { unmount } = render(<Harness initial={[view('a')]} />);

    expect(screen.getByText('Needs your sign-off')).toBeInTheDocument();
    unmount();

    render(<Harness initial={[view('a'), view('b', { kind: 'tool_approval' })]} />);

    expect(screen.getByText('Needs your attention · 2')).toBeInTheDocument();
  });

  it('opens a modal listing every item, newest first, each with its own content', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          view('old', { raisedAt: '2026-10-19T08:00:00.000Z' }),
          view('new', { raisedAt: '2026-10-19T10:00:00.000Z' }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = await screen.findByRole('dialog');
    const list = within(dialog).getByRole('region', { name: 'Waiting on you (2)' });
    const titles = within(list)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);

    expect(titles).toEqual(['Item new', 'Item old']);
    expect(within(list).getByRole('button', { name: 'Answer new' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Answer old' })).toBeInTheDocument();
  });

  it('closes on Escape, returns focus to Open, answers nothing and can be reopened', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[view('a')]} />);
    const open = screen.getByRole('button', { name: 'Open' });

    await user.click(open);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Needs your sign-off')).toBeInTheDocument();
    expect(open).toHaveFocus();

    await user.click(open);

    expect(await screen.findByRole('button', { name: 'Answer a' })).toBeInTheDocument();
  });

  it('traps focus inside the modal while it is open', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[view('a')]} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');

    for (let press = 0; press < 6; press += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('closes itself and drops the alert once the last item is answered', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[view('a'), view('b')]} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('button', { name: 'Answer a' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Needs your sign-off')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Answer b' }));

    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('holds the actions while offline and says why', async () => {
    const user = userEvent.setup();
    render(
      <NeedsYouPill
        online={false}
        views={[
          view('a', {
            primary: { id: 'retry_step', label: 'Retry', onRun: () => undefined },
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
  });
});
