/**
 * Pins: editing a built-in agent: the save, the Reset confirm, the 409 conflict choice, leaving with
 * unsaved edits, and the agent's history.
 *
 * Why: a built-in edit that cannot be undone, a second save that overwrites a colleague's, or edits
 * lost on a stray click would each change how Workers behave without the owner meaning it. Each is
 * pinned here over the stubbed Forge server, which versions and refuses like the server does.
 * Depends on: components/agents/*, the stubbed Forge server, renderApp, agent-screens.
 */

import { BUILTIN_AGENTS } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  bodiesTo,
  openEditor,
  pickMenu,
  rowOf,
  saveAgent,
} from '#tests/helpers/agent-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PATH = '/settings/agents';

type Put = {
  agent: {
    instructions: string;
    description: string;
    runs_on: { harness: string; model: unknown; fallbacks: { model: { id: string } }[] };
  };
  expected_version: number;
  reason: string;
};

describe('editing a built-in agent', () => {
  it('saves a built-in, tags it edited, and Reset puts it back after a confirm', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await openEditor(user, 'Reviewer');

    await user.type(
      screen.getByRole('textbox', { name: 'Instructions (markdown)' }),
      ' Also check naming.',
    );

    await saveAgent(user, 'Save agent', 'house style');

    expect(await screen.findByText('Saved as version 3.')).toBeVisible();

    const [sent] = bodiesTo(forge, 'PUT', '/settings/agents/reviewer') as Put[];

    expect(sent?.agent.instructions).toMatch(/ Also check naming\.$/);
    expect(sent).toMatchObject({ expected_version: 2, reason: 'house style' });

    await user.click(screen.getByRole('button', { name: /All agents/ }));
    expect(within(await rowOf('Reviewer')).getByText('edited')).toBeVisible();

    await pickMenu(user, 'More actions for Reviewer', /Reset to built-in/);
    const dialog = await screen.findByRole('dialog', {
      name: 'Reset Reviewer to its built-in text?',
    });

    expect(forge.stub.callsTo('POST /settings/agents/:id/reset')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));

    await waitFor(async () =>
      expect(within(await rowOf('Reviewer')).queryByText('edited')).toBeNull(),
    );

    expect(bodiesTo(forge, 'POST', '/settings/agents/reviewer/reset')[0]).toEqual({
      expected_version: 3,
      reason: 'Reset to the default',
    });
  });

  it('offers Reset only for a built-in that was edited', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await screen.findByRole('list', { name: 'Agent roster' });

    await user.click(screen.getByRole('button', { name: 'More actions for Reviewer' }));

    expect(screen.queryByRole('menuitem', { name: /Reset/ })).toBeNull();
  });

  it('a second save from a stale tab is paused behind a choice, never an overwrite', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    const { api } = forge;
    await openEditor(user, 'Critic');

    await user.type(screen.getByLabelText('Description'), ' (mine)');
    await api.agents.update({ kind: 'company' }, 'critic', {
      kind: 'agent',
      agent: { ...BUILTIN_AGENTS['critic']!, description: 'Changed in another tab.' },
      expected_version: 2,
      reason: 'from another tab',
    });

    await saveAgent(user, 'Save agent', 'mine');

    const banner = (
      await screen.findByText(/These agents changed since you opened this one/)
    ).closest('[role="alert"]') as HTMLElement;

    expect(banner).toHaveTextContent('version 2');
    expect(screen.getByRole('button', { name: 'Save agent' })).toBeDisabled();

    await user.click(
      within(banner).getByRole('button', { name: 'Review their changes' }),
    );

    expect(banner).toHaveTextContent('Description');

    await user.click(
      within(banner).getByRole('button', { name: 'Keep my edits on the latest' }),
    );

    await user.type(screen.getByLabelText('Reason for this change'), 'second try');
    await user.click(screen.getByRole('button', { name: 'Save agent' }));

    expect(await screen.findByText('Saved as version 4.')).toBeVisible();

    const puts = bodiesTo(forge, 'PUT', '/settings/agents/critic') as Put[];

    expect(puts.map((p) => p.expected_version)).toEqual([2, 2, 3]);
  });

  it('Reload latest drops the edits and shows what is saved', async () => {
    const user = userEvent.setup();
    const { api } = renderApp({ path: PATH }).forge;
    await openEditor(user, 'Critic');

    await user.type(screen.getByLabelText('Description'), ' (mine)');
    await api.agents.update({ kind: 'company' }, 'critic', {
      kind: 'agent',
      agent: { ...BUILTIN_AGENTS['critic']!, description: 'Changed in another tab.' },
      expected_version: 2,
      reason: 'from another tab',
    });

    await saveAgent(user, 'Save agent', 'mine');
    await user.click(
      await screen.findByRole('button', { name: /Reload latest and discard my edits/ }),
    );

    expect(screen.getByLabelText('Description')).toHaveValue('Changed in another tab.');
    expect(screen.queryByText(/changed since you opened/)).toBeNull();
  });

  it('asks before leaving an agent with unsaved edits', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await openEditor(user, 'Critic');

    await user.type(screen.getByLabelText('Description'), ' more');
    await user.click(screen.getByRole('button', { name: /All agents/ }));

    const ask = await screen.findByRole('alertdialog', { name: 'Discard your changes?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByLabelText('Description')).toHaveValue(
      `${BUILTIN_AGENTS['critic']!.description} more`,
    );

    await user.click(screen.getByRole('button', { name: /All agents/ }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Discard',
      }),
    );

    expect(await screen.findByRole('list', { name: 'Agent roster' })).toBeVisible();
  });

  it('shows the agent’s history, newest first, when asked', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await openEditor(user, 'Critic');

    expect(screen.queryByRole('list', { name: 'Agent history' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show history' }));

    const rows = await screen.findByRole('list', { name: 'Agent history' });

    expect(within(rows).getByText(/Version 1/)).toBeVisible();
    expect(within(rows).getByText('First version')).toBeVisible();
  });
});
