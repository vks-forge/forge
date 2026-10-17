/**
 * Pins: a project's own agents (create, edit, archive), copies into the project or the company, and
 * the project's shared version counter.
 *
 * Why: an agent write is a new version of the project's settings, so the Agents tab and the other
 * tabs must agree on it: a copy goes to the version of the scope it lands in, and the project save
 * bar must neither report a conflict about a version this tab itself moved nor hide a real one.
 * Each is pinned here over the stubbed Forge server.
 * Depends on: routes/project-settings/*, the stubbed Forge server, renderApp, agent-screens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bodiesTo, pickMenu, rowOf, saveAgent } from '#tests/helpers/agent-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';

const BASE = '/p/sample-service/settings';
const PATH = `${BASE}/agents`;
const API = '/settings/projects/sample-service/agents';

const tab = (name: string): HTMLElement =>
  within(screen.getByRole('navigation', { name: 'Project settings sections' })).getByRole(
    'link',
    { name },
  );

async function ready() {
  await screen.findByRole('heading', { name: 'Agents for this project', level: 2 });
  await screen.findByRole('list', { name: 'Agent roster' });
}

describe('project agents: its own', () => {
  it('creates a project agent at the project version, edits it, archives it', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'New project agent', /From scratch/);
    await user.type(await screen.findByLabelText('Name'), 'Docs checker');
    await user.type(
      screen.getByLabelText('Description'),
      'Checks the docs of this project.',
    );

    await saveAgent(user, 'Create agent', 'project only');
    await screen.findByText('Created as version 4.');

    expect(bodiesTo(forge, 'POST', API)[0]).toMatchObject({
      origin: 'custom',
      expected_version: 3,
      agent: { name: 'Docs checker' },
    });

    expect(screen.queryByText('overridden')).toBeNull();
    expect(screen.getByText('project')).toBeVisible();

    await user.type(screen.getByLabelText('Description'), ' More.');
    await saveAgent(user, 'Save agent', 'tweak');
    await screen.findByText('Saved as version 5.');

    expect(bodiesTo(forge, 'PUT', `${API}/docs-checker`)[0]).toMatchObject({
      agent: { name: 'Docs checker' },
      expected_version: 4,
    });

    await user.click(screen.getByRole('button', { name: /All agents/ }));
    await pickMenu(user, 'More actions for Docs checker', 'Archive');
    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    await waitFor(async () =>
      expect(within(await rowOf('Docs checker')).getByText('archived')).toBeVisible(),
    );

    expect(bodiesTo(forge, 'POST', `${API}/docs-checker/archive`)).toHaveLength(1);
  });

  it('copies an agent into this project at the project version', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'More actions for Reviewer', /Duplicate/);
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate Reviewer' });

    expect(
      within(dialog).getByRole('radio', { name: 'This project only' }),
    ).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Make a copy' }));

    await screen.findByRole('heading', { name: 'Reviewer copy', level: 2 });

    expect(bodiesTo(forge, 'POST', `${API}/reviewer/duplicate`)[0]).toEqual({
      name: 'Reviewer copy',
      scope: 'project',
      project: 'sample-service',
      expected_version: 3,
      reason: 'Copied from another agent',
    });
  });

  it('copies an agent into the company at the company version and stays on the list', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'More actions for Reviewer', /Duplicate/);
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate Reviewer' });
    await user.click(within(dialog).getByRole('radio', { name: /The company/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Make a copy' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(bodiesTo(forge, 'POST', `${API}/reviewer/duplicate`)[0]).toMatchObject({
      scope: 'company',
      expected_version: 2,
    });

    expect(screen.getByRole('list', { name: 'Agent roster' })).toBeVisible();
  });
});

describe('project agents and the project’s version', () => {
  it('follows the new version quietly when nothing else is being edited', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    // The server counts agent writes in the project's own settings version.
    await forge.api.projectSettings.save({
      slug: 'sample-service',
      doc: { default_harness: 'codex' },
      reason: 'as an agent write does',
      expectedVersion: 3,
    });

    await pickMenu(user, 'More actions for Critic', 'Disable here');
    await user.click(await screen.findByRole('button', { name: 'Switch off' }));
    await waitFor(async () =>
      expect(within(await rowOf('Critic')).getByText('disabled')).toBeVisible(),
    );

    expect(screen.queryByText(/changed since you opened/)).toBeNull();

    await user.click(tab('Workers'));
    expect(await screen.findByText(/Version 4/)).toBeVisible();
    expect(screen.queryByText(/changed since you opened/)).toBeNull();
  });

  it('tells an owner who is editing another tab that the version moved', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: `${BASE}/workers` });

    await user.click(
      await screen.findByRole('switch', { name: 'Override Fallback harnesses' }),
    );

    await user.click(tab('Agents'));
    await ready();
    await forge.api.projectSettings.save({
      slug: 'sample-service',
      doc: { default_harness: 'codex' },
      reason: 'as an agent write does',
      expectedVersion: 3,
    });

    await pickMenu(user, 'More actions for Critic', 'Disable here');
    await user.click(await screen.findByRole('button', { name: 'Switch off' }));
    await waitFor(async () =>
      expect(within(await rowOf('Critic')).getByText('disabled')).toBeVisible(),
    );

    expect(screen.queryByText(/changed since you opened/)).toBeNull();

    await user.click(tab('Workers'));

    expect(await screen.findByText(/changed since you opened/)).toBeVisible();
  });
});
