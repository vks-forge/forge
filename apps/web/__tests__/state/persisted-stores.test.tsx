/**
 * Pins: UI state persists in `localStorage` under `forge.ui.<name>` and survives a reload;
 * blocked, corrupt, outdated or hand-edited storage falls back to defaults without throwing;
 * and only the allowed UI fields are ever written (never server data, tokens or run content).
 *
 * Why: d-0122 puts preferences and unsent drafts in persisted zustand stores. That is only
 *   safe if a bad stored value can never crash the first paint, and if nobody can quietly start
 *   saving a ticket, an install token or a Worker's output into the browser's storage. The
 *   allow-list below is the contract: adding a persisted field means changing this test on
 *   purpose.
 * Depends on: src/state/*, src/schemas/ui-state, helpers/render-app (for the whole-app check).
 *   jsdom, localStorage.
 */

import { renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { answerDraftsStore, useAnswerDraft } from '#/state/answer-draft.js';
import { boardPrefsStore, useBoardPrefs } from '#/state/board-prefs.js';
import { createPersistedStore, storageKeyOf } from '#/state/create-persisted-store.js';
import { projectPrefsStore, rememberProject } from '#/state/current-project.js';
import { themePrefsStore } from '#/state/theme-provider.js';
import { threadPrefsStore, useThreadPrefs } from '#/state/thread-prefs.js';
import { authorPrefsStore, useAuthorPrefs } from '#/state/use-author-prefs.js';
import { memoryPrefsStore, useMemoryPrefs } from '#/state/use-memory-prefs.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const probe = () =>
  createPersistedStore({
    name: 'probe',
    version: 2,
    initial: { count: 1 },
    schema: z.object({ count: z.number() }),
    migrate: (saved, from) =>
      from === 1 ? { count: (saved as { count: number }).count * 10 } : { count: 1 },
  });

const saved = (name: string): { state: Record<string, unknown>; version: number } =>
  JSON.parse(localStorage.getItem(storageKeyOf(name)) ?? 'null');

describe('createPersistedStore', () => {
  it('writes only its fields under forge.ui.<name> with a version, and reads them back', async () => {
    const store = probe();

    store.setState({ count: 5 });

    expect(saved('probe')).toEqual({ state: { count: 5 }, version: 2 });

    store.setState({ count: 1 });
    localStorage.setItem(
      storageKeyOf('probe'),
      JSON.stringify({ state: { count: 7 }, version: 2 }),
    );

    await store.persist.rehydrate();

    expect(store.getState().count).toBe(7);
  });

  it('falls back to the defaults when the stored text is not JSON', async () => {
    const store = probe();
    localStorage.setItem(storageKeyOf('probe'), '{not json');

    await expect(store.persist.rehydrate()).resolves.not.toThrow();

    expect(store.getState().count).toBe(1);
  });

  it('falls back to the defaults when the stored value has the wrong shape', async () => {
    const store = probe();
    localStorage.setItem(
      storageKeyOf('probe'),
      JSON.stringify({ state: { count: 'many' }, version: 2 }),
    );

    await store.persist.rehydrate();

    expect(store.getState().count).toBe(1);
  });

  it('upgrades an older saved version through migrate, and forgets an unknown one', async () => {
    const store = probe();
    localStorage.setItem(
      storageKeyOf('probe'),
      JSON.stringify({ state: { count: 4 }, version: 1 }),
    );

    await store.persist.rehydrate();

    expect(store.getState().count).toBe(40);

    localStorage.setItem(
      storageKeyOf('probe'),
      JSON.stringify({ state: { count: 4 }, version: 99 }),
    );

    await store.persist.rehydrate();

    expect(store.getState().count).toBe(1);
  });

  it('keeps working when storage is blocked for reads and writes', async () => {
    const store = probe();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    await expect(store.persist.rehydrate()).resolves.not.toThrow();
    store.setState({ count: 3 });

    expect(store.getState().count).toBe(3);
    vi.restoreAllMocks();
  });
});

describe('what the app persists', () => {
  it('writes only the allowed fields of each store, and nothing else', () => {
    const board = renderHook(() => useBoardPrefs());
    const thread = renderHook(() => useThreadPrefs());
    const draft = renderHook(() => useAnswerDraft('int-1'));
    const author = renderHook(() => useAuthorPrefs());
    const memory = renderHook(() => useMemoryPrefs('decisions'));

    act(() => {
      board.result.current.setView('tickets');
      board.result.current.setCardFilter({ type: 'plan' });
      board.result.current.setFilter({ query: 'csv', lane: 'full' });
      thread.result.current.setFollowLatest(false);
      draft.result.current.setDraft('Use UTC');
      author.result.current[1]('Vik');
      memory.result.current.setFilter({
        tab: 'proposals',
        text: 'vitest',
        tags: ['tests'],
        activeOnly: true,
      });

      rememberProject('sample-web');
      themePrefsStore.setState({ mode: 'dark' });
    });

    const allowed: Record<string, string[]> = {
      board: ['cardFilter', 'filter', 'view'],
      thread: ['expandTools', 'followLatest'],
      drafts: ['drafts'],
      author: ['author'],
      memory: ['chosen'],
      project: ['slug'],
      theme: ['mode'],
    };

    const keys = Object.keys(localStorage).sort();

    expect(keys).toEqual(Object.keys(allowed).map(storageKeyOf).sort());
    for (const [name, fields] of Object.entries(allowed)) {
      expect(Object.keys(saved(name).state).sort()).toEqual(fields);
    }

    expect(saved('memory').state).toEqual({
      chosen: { tab: 'proposals', tags: ['tests'], activeOnly: true },
    });

    expect(localStorage.getItem(storageKeyOf('memory'))).not.toContain('vitest');
  });

  it('never stores server data, tokens or run content while the app is used', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/p/sample-service/tickets/SVC-4' });
    await openNeedsYou(user);
    await screen.findByText(/Question: the Worker needs your answer/);
    expect(await screen.findByText(/The window is computed in UTC/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your answer'), 'Use the account time zone');

    const stored = Object.entries(localStorage).map(([key, value]) => [key, value]);

    expect(stored.every(([key]) => key?.startsWith('forge.ui.'))).toBe(true);

    const text = JSON.stringify(stored);

    expect(text).toContain('Use the account time zone');
    for (const secret of [
      'Fix off-by-one',
      'Bearer',
      'authorization',
      'install-token',
      'The window is computed in UTC',
      'Should the report window use UTC',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('puts every store back to its defaults between tests', () => {
    expect(boardPrefsStore.getState().view).toBe('cards');
    expect(threadPrefsStore.getState().followLatest).toBe(true);
    expect(answerDraftsStore.getState().drafts).toEqual({});
    expect(authorPrefsStore.getState().author).toBe('');
    expect(memoryPrefsStore.getState().chosen).toBeNull();
    expect(projectPrefsStore.getState().slug).toBeNull();
    expect(themePrefsStore.getState().mode).toBe('system');
  });
});
