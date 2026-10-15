/**
 * Pins: the theme toggle applies and remembers the user's choice, a blocked localStorage does
 * not crash it, the unsaved-changes hook clears itself on unmount, and the query client retries
 * only dead connections.
 *
 * Why: theme is the one preference every user touches, and a throwing localStorage (private
 *   mode) must not take the app down. A stale "dirty" flag after a form unmounts would block
 *   navigation forever. Retrying refusals would hold the error state back for seconds.
 * Depends on: src/state/*, src/api/query-client, helpers/render-app. jsdom, localStorage.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { createQueryClient } from '#/api/query-client.js';
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
  useUnsavedChangesState,
} from '#/state/unsaved-changes.js';
import { themePrefsStore } from '#/state/theme-provider.js';
import { renderApp } from '#tests/helpers/render-app.js';

function Form(props: { dirty: boolean }) {
  useUnsavedChanges(props.dirty);

  return null;
}

function Status() {
  return <p>{useUnsavedChangesState().dirty ? 'dirty' : 'clean'}</p>;
}

describe('theme toggle', () => {
  it('cycles the theme, sets data-theme and remembers the choice', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/p/sample-service' });
    const toggle = await screen.findByRole('button', { name: /^Theme: system/ });

    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(JSON.parse(localStorage.getItem('forge.ui.theme') ?? '{}').state).toEqual({
      mode: 'light',
    });

    await user.click(screen.getByRole('button', { name: /^Theme: light/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await user.click(screen.getByRole('button', { name: /^Theme: dark/ }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('starts from the saved choice', async () => {
    localStorage.setItem(
      'forge.ui.theme',
      JSON.stringify({ state: { mode: 'dark' }, version: 1 }),
    );

    await themePrefsStore.persist.rehydrate();
    renderApp({ path: '/p/sample-service' });

    await screen.findByRole('button', { name: /^Theme: dark/ });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('still switches when storage is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderApp({ path: '/p/sample-service' });

    await user.click(await screen.findByRole('button', { name: /^Theme: system/ }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    vi.restoreAllMocks();
  });
});

describe('unsaved-changes registry', () => {
  it('reports dirty while a view holds edits and clears when it unmounts', () => {
    const { rerender } = render(
      <UnsavedChangesProvider>
        <Status />
        <Form dirty />
      </UnsavedChangesProvider>,
    );

    expect(screen.getByText('dirty')).toBeInTheDocument();

    rerender(
      <UnsavedChangesProvider>
        <Status />
      </UnsavedChangesProvider>,
    );

    expect(screen.getByText('clean')).toBeInTheDocument();
  });

  it('asks the browser before the tab closes while dirty', () => {
    render(
      <UnsavedChangesProvider>
        <Form dirty />
      </UnsavedChangesProvider>,
    );

    const event = new Event('beforeunload', { cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('query client', () => {
  it('retries a dead connection once and never retries a refusal', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      failures: number,
      error: unknown,
    ) => boolean;

    expect(retry(0, new ApiError('network', 'x'))).toBe(true);
    expect(retry(1, new ApiError('network', 'x'))).toBe(false);
    expect(retry(0, new ApiError('http', 'x', { status: 401 }))).toBe(false);
    expect(retry(0, new Error('x'))).toBe(false);
  });
});
