/**
 * Pins: a steering message bubble names who sent it ("Director → Worker", "You → Worker",
 * or the author) and shows "Delivered" or "Waiting to be delivered".
 *
 * Why: the owner watching a run must see exactly what the Director or they told the Worker
 *   and whether the harness has taken it. A bare "delivered" line with no text left them
 *   unable to tell what was sent.
 * Depends on: components/thread/thread-item-view. No network.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThreadItemView } from '#/components/thread/thread-item-view.js';
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
