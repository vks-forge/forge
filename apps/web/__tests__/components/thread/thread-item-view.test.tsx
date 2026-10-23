/**
 * Pins: a steering message bubble names who sent it ("Director → Worker", "You → Worker",
 * or the author) and shows "Delivered" or "Waiting to be delivered".
 *
 * A call waiting for the owner's approval names itself and links to its dock item.
 *
 * Why: the owner watching a run must see exactly what the Director or they told the Worker
 *   and whether the harness has taken it. A bare "delivered" line with no text left them
 *   unable to tell what was sent.
 * Depends on: components/thread/thread-item-view. No network.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThreadItemView } from '#/components/thread/thread-item-view.js';
import { DOCK_OPEN_EVENT } from '#/domain/needs-you-dock.js';
import type { UserItem } from '#/types/thread.types.js';

const item = (over: Partial<UserItem> = {}): UserItem => ({
  kind: 'user',
  seq: 1,
  ts: '2026-10-16T10:00:00.000Z',
  author: 'director',
  text: 'Use the existing helper.',
  inboxSeq: 1,
  delivered: false,
  ...over,
});

const draw = (i: UserItem) =>
  render(<ThreadItemView item={i} expandTools={false} pending={new Set()} />);

describe('ThreadItemView steering bubble', () => {
  it('labels a Director message and shows its full text, waiting', () => {
    draw(item());

    expect(screen.getByText('Director → Worker')).toBeTruthy();
    expect(screen.getByText('Use the existing helper.')).toBeTruthy();
    expect(screen.getByText('Waiting to be delivered')).toBeTruthy();
  });

  it('labels the owner "You → Worker" and shows Delivered once taken', () => {
    draw(item({ author: 'owner', delivered: true }));

    expect(screen.getByText('You → Worker')).toBeTruthy();
    expect(screen.getByText('Delivered')).toBeTruthy();
  });

  it('names any other author', () => {
    draw(item({ author: 'cli' }));

    expect(screen.getByText('cli → Worker')).toBeTruthy();
  });
});

describe('ThreadItemView: a call waiting for approval', () => {
  const ask = {
    kind: 'decision',
    seq: 3,
    ts: '2026-10-16T10:00:00.000Z',
    tool: 'Bash',
    decision: 'ask',
    interactionId: 'int-p1',
    what: 'make install-deps',
  } as const;

  it('says what it waits for and links to the item while it is pending', () => {
    const listener = vi.fn();
    window.addEventListener(DOCK_OPEN_EVENT, listener);
    render(
      <ThreadItemView item={ask} expandTools={false} pending={new Set(['int-p1'])} />,
    );

    expect(screen.getByText('Waiting for your approval:')).toBeTruthy();
    expect(screen.getByText('make install-deps')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Open it' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      interactionId: 'int-p1',
    });

    window.removeEventListener(DOCK_OPEN_EVENT, listener);
  });

  it('reads as a record, with no link, once the owner has answered', () => {
    render(<ThreadItemView item={ask} expandTools={false} pending={new Set()} />);

    expect(screen.getByText('Asked for your approval:')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open it' })).toBeNull();
  });
});
