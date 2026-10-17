/**
 * Pins: a new needs-you Inbox item raises one toast (id keyed on the item) with an Open action
 * that goes to the item and refreshes the badge counts; items present at first load are not
 * announced; the same item is never announced twice, also across a reload in the same session;
 * a project switch re-seeds; a desktop notification fires only for a hidden tab with the
 * setting on and permission granted; blocked storage does not break any of it.
 *
 * Why: the notifier is the one thing that interrupts the owner. Flooding them on open,
 *   repeating a toast, popping up desktop notices they did not enable, or crashing on a locked
 *   down browser would each make them turn the feature off or distrust Forge.
 * Depends on: api/use-inbox-notifier, state/notify/notify-store, state/notify-prefs,
 *   state/inbox-seen. jsdom, react-router MemoryRouter, a hand-made ForgeApi.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import type { InboxItem } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '#/api/api-provider.js';
import { useInboxNotifier } from '#/api/use-inbox-notifier.js';
import { setBrowserNotify } from '#/state/notify-prefs.js';
import { notifyStore, useNotifyStore } from '#/state/notify/notify-store.js';
import type { ForgeApi } from '#/types/api.types.js';

function item(id: string, patch: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    kind: 'question',
    project: 'alpha',
    title: `Item ${id}`,
    ticket_id: 'ALP-1',
    needs_action: true,
    updated_at: '2026-10-01T10:00:00.000Z',
    read: false,
    archived: false,
    ...patch,
  };
}

function setup(initial: Record<string, InboxItem[]>) {
  const lists = { ...initial };
  const counts = vi.fn(() =>
    Promise.resolve({ needs_action: 0, unread: 0, all: 0, archived: 0 }),
  );

  const list = vi.fn((slug: string) =>
    Promise.resolve({ items: lists[slug] ?? [], nextCursor: null }),
  );

  const api = { inbox: { list, counts } } as unknown as ForgeApi;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ApiProvider api={api}>
        <MemoryRouter>{children}</MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>
  );

  const refetch = (slug: string) =>
    act(() => client.invalidateQueries({ queryKey: ['inbox', slug, 'preview'] }));

  const loaded = (slug: string) =>
    waitFor(() =>
      expect(client.getQueryData(['inbox', slug, 'preview', 20])).toBeDefined(),
    );

  return { lists, client, wrapper, refetch, loaded };
}

const toasts = () => useNotifyStore.getState().items;

beforeEach(() => {
  notifyStore.dismiss();
  sessionStorage.clear();
  setBrowserNotify(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
});

describe('useInboxNotifier', () => {
  it('stays quiet for items present at first load', async () => {
    const { wrapper, loaded } = setup({ alpha: [item('question:a')] });

    renderHook(() => useInboxNotifier('alpha'), { wrapper });
    await loaded('alpha');

    expect(toasts()).toHaveLength(0);
  });

  it('toasts a new item once with an Open action, and refreshes the badge counts', async () => {
    const { wrapper, lists, refetch, client, loaded } = setup({
      alpha: [item('question:a')],
    });

    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(
      () => {
        useInboxNotifier('alpha');

        return useLocation().pathname;
      },
      { wrapper },
    );

    await loaded('alpha');

    lists.alpha = [item('question:b', { title: 'Which store?' }), item('question:a')];
    await refetch('alpha');

    await waitFor(() => expect(toasts()).toHaveLength(1));
    const toast = toasts()[0]!;

    expect(toast.id).toBe('inbox:alpha:question:b');
    expect(toast.title).toBe('Which store?');
    expect(toast.description).toBe('alpha · Question');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inbox', 'alpha', 'counts'] });

    await refetch('alpha');
    expect(toasts()).toHaveLength(1);

    act(() => void toast.action?.onClick());
    expect(view.result.current).toBe('/p/alpha/tickets/ALP-1');
  });

  it('does not repeat an item after a reload in the same session', async () => {
    const first = setup({ alpha: [item('question:a')] });
    const one = renderHook(() => useInboxNotifier('alpha'), { wrapper: first.wrapper });
    await first.loaded('alpha');
    first.lists.alpha = [item('question:b'), item('question:a')];
    await first.refetch('alpha');
    await waitFor(() => expect(toasts()).toHaveLength(1));
    one.unmount();
    notifyStore.dismiss();

    // A "reload": new query client and refs, same sessionStorage; item b is still waiting.
    const second = setup({ alpha: [item('question:b'), item('question:a')] });
    renderHook(() => useInboxNotifier('alpha'), { wrapper: second.wrapper });
    await second.loaded('alpha');
    await second.refetch('alpha');

    expect(toasts()).toHaveLength(0);
  });

  it('re-seeds on a project switch instead of announcing the other project items', async () => {
    const { wrapper, lists, refetch, loaded } = setup({
      alpha: [item('question:a')],
      beta: [item('question:x', { project: 'beta' })],
    });

    const view = renderHook(({ slug }) => useInboxNotifier(slug), {
      wrapper,
      initialProps: { slug: 'alpha' },
    });

    await loaded('alpha');

    view.rerender({ slug: 'beta' });
    await loaded('beta');
    expect(toasts()).toHaveLength(0);

    lists.beta = [item('question:y', { project: 'beta' }), ...lists.beta!];
    await refetch('beta');

    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]!.id).toBe('inbox:beta:question:y');
  });

  describe('desktop notification', () => {
    async function arrive() {
      const ctx = setup({ alpha: [item('question:a')] });

      renderHook(() => useInboxNotifier('alpha'), { wrapper: ctx.wrapper });
      await ctx.loaded('alpha');
      ctx.lists.alpha = [item('question:b'), item('question:a')];
      await ctx.refetch('alpha');
      await waitFor(() => expect(toasts()).toHaveLength(1));
    }

    function stubNotification(permission: string, hidden: boolean) {
      const ctor = vi.fn(function (this: object) {
        Object.assign(this, { close: vi.fn() });
      });

      Object.assign(ctor, { permission });
      vi.stubGlobal('Notification', ctor);
      Object.defineProperty(document, 'visibilityState', {
        value: hidden ? 'hidden' : 'visible',
        configurable: true,
      });

      return ctor;
    }

    it('fires when the tab is hidden, the setting is on and permission is granted', async () => {
      const ctor = stubNotification('granted', true);

      setBrowserNotify(true);

      await arrive();

      expect(ctor).toHaveBeenCalledWith('Item question:b', {
        body: 'alpha · Question',
        tag: 'question:b',
      });
    });

    it.each([
      ['the tab is visible', 'granted', false, true],
      ['the setting is off', 'granted', true, false],
      ['permission is not granted', 'default', true, true],
    ] as const)('does not fire when %s', async (_name, permission, hidden, enabled) => {
      const ctor = stubNotification(permission, hidden);

      setBrowserNotify(enabled);

      await arrive();

      expect(ctor).not.toHaveBeenCalled();
    });
  });

  it('keeps working when session storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { wrapper, lists, refetch, loaded } = setup({ alpha: [item('question:a')] });

    renderHook(() => useInboxNotifier('alpha'), { wrapper });
    await loaded('alpha');

    lists.alpha = [item('question:b'), item('question:a')];
    await refetch('alpha');

    await waitFor(() => expect(toasts()).toHaveLength(1));
  });
});
