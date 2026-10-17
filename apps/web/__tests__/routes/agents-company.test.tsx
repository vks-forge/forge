/**
 * Pins: Forge settings, Agents: the roster with its tags and states, copying, archiving and opening an
 * agent.
 *
 * Why: this screen decides which agents the Director may use and what they cost. The failures that
 * hurt are quiet ones: a built-in that looks the same after it was edited, an archived agent that
 * vanishes instead of waiting to be brought back, a copy that cannot be named, a blank roster with no
 * way forward. Each is pinned here over the stubbed Forge server, which versions and refuses like
 * the server does.
 * Depends on: routes/settings/agents-page, the stubbed Forge server, renderApp, agent-screens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bodiesTo, openEditor, pickMenu, rowOf } from '#tests/helpers/agent-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { json } from '#tests/helpers/fetch-stub.js';

const PATH = '/settings/agents';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Agents', level: 1 });
  await screen.findByRole('list', { name: 'Agent roster' });
}

describe('company agents: the roster', () => {
  it('lists the built-in agents with their tags, role and where they run', async () => {
    renderApp({ path: PATH });
    await ready();

    const names = within(screen.getByRole('list', { name: 'Agent roster' }))
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);

    expect(names).toEqual(['Implementer', 'Test writer', 'Reviewer', 'Critic']);

    const implementer = await rowOf('Implementer');

    expect(within(implementer).getByText('built-in')).toBeVisible();
    expect(within(implementer).getByText('Writer')).toBeVisible();
    expect(within(implementer).getByText(/project harness · lane model/)).toBeVisible();
    expect(within(implementer).getByText('Ready')).toBeVisible();
    expect(
      within(await rowOf('Reviewer')).getByText(/project harness · opus/),
    ).toBeVisible();
  });

  it('shows loading first, then the roster', async () => {
    renderApp({ path: PATH });

    expect(screen.getByRole('status', { name: 'Loading agents' })).toBeVisible();
    await ready();
    expect(screen.queryByRole('status', { name: 'Loading agents' })).toBeNull();
  });

  it('says when Forge cannot be reached and retries', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH, scenario: 'error' });

    expect(await screen.findByText('Cannot reach Forge')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
  });

  it('an empty roster offers the three ways to start', async () => {
    const user = userEvent.setup();
    renderApp({
      path: PATH,
      routes: { 'GET /settings/agents': json({ agents: [], version: 0 }) },
    });

    expect(await screen.findByText('No agents yet')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New agent' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'From scratchFill in every field yourself.',
      'From templateStart from a ready-made reviewer or writer.',
      'Describe it to the DirectorSay what it is for; the Director drafts it.',
    ]);
  });
});

describe('company agents: copying and setting aside', () => {
  it('duplicate asks for a name and a reason, then opens the copy in the editor', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'More actions for Reviewer', /Duplicate/);
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate Reviewer' });

    expect(within(dialog).getByLabelText('Name of the copy')).toHaveValue(
      'Reviewer copy',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Make a copy' }));

    await screen.findByRole('heading', { name: 'Reviewer copy', level: 2 });
    expect(
      screen.getByText('Copy created. Change what you need and save.'),
    ).toBeVisible();

    expect(bodiesTo(forge, 'POST', '/settings/agents/reviewer/duplicate')[0]).toEqual({
      name: 'Reviewer copy',
      scope: 'company',
      expected_version: 2,
      reason: 'Copied from another agent',
    });
  });

  it('a taken name is refused in words and the dialog stays open', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'More actions for Reviewer', /Duplicate/);
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate Reviewer' });
    await user.clear(within(dialog).getByLabelText('Name of the copy'));
    await user.type(within(dialog).getByLabelText('Name of the copy'), 'Critic');
    await user.click(within(dialog).getByRole('button', { name: 'Make a copy' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That name is taken',
    );
  });

  it('archives a custom agent, keeps it listed as archived and can bring it back', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'More actions for Reviewer', /Duplicate/);
    await user.click(await screen.findByRole('button', { name: 'Make a copy' }));
    await screen.findByRole('heading', { name: 'Reviewer copy', level: 2 });
    await user.click(screen.getByRole('button', { name: /All agents/ }));

    await pickMenu(user, 'More actions for Reviewer copy', 'Archive');
    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    await waitFor(async () =>
      expect(within(await rowOf('Reviewer copy')).getByText('archived')).toBeVisible(),
    );

    expect(
      bodiesTo(forge, 'POST', '/settings/agents/reviewer-copy/archive')[0],
    ).toMatchObject({
      reason: 'Archived from the agents list',
    });

    await pickMenu(user, 'More actions for Reviewer copy', 'Unarchive');
    await user.click(await screen.findByRole('button', { name: 'Unarchive' }));

    await waitFor(async () =>
      expect(within(await rowOf('Reviewer copy')).queryByText('archived')).toBeNull(),
    );
  });

  it('offers no archive for a built-in agent', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await ready();

    await user.click(
      screen.getByRole('button', { name: 'More actions for Implementer' }),
    );

    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Duplicate…',
    ]);
  });

  it('opens an agent for editing from the roster', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await ready();

    await openEditor(user, 'Critic');

    expect(screen.getByLabelText('Name')).toHaveValue('Critic');
    expect(screen.getByText('Agent id: critic')).toBeVisible();
  });
});
