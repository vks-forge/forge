/**
 * Pins: the unread count is written as a "(n) " prefix on whatever title a page sets, follows
 * later title changes, changes with the count, and is gone at zero and on unmount.
 *
 * Why: the tab title is the only signal while Forge is in a background tab, and many pages
 *   set the title themselves. If the prefix were lost on navigation or stuck at zero the
 *   owner would be misled or would learn to ignore it.
 * Depends on: api/use-title-badge, jsdom document.title and MutationObserver.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTitleBadge } from '#/api/use-title-badge.js';

afterEach(() => {
  document.title = '';
});

describe('useTitleBadge', () => {
  it('prefixes the title, keeps the prefix when a page rewrites the title, and clears at 0', async () => {
    document.title = 'Inbox · Forge';
    const view = renderHook(({ n }) => useTitleBadge(n), { initialProps: { n: 3 } });

    expect(document.title).toBe('(3) Inbox · Forge');

    document.title = 'Board · Forge';
    await waitFor(() => expect(document.title).toBe('(3) Board · Forge'));

    view.rerender({ n: 5 });
    expect(document.title).toBe('(5) Board · Forge');

    view.rerender({ n: 0 });
    expect(document.title).toBe('Board · Forge');
  });

  it('removes the prefix when the shell unmounts', () => {
    document.title = 'Home · Forge';
    const view = renderHook(() => useTitleBadge(2));

    expect(document.title).toBe('(2) Home · Forge');

    view.unmount();

    expect(document.title).toBe('Home · Forge');
  });
});
