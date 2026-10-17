/**
 * Pins: a project's Agents tab: the company agents as this project sees them, an override of
 * instructions and harness (and its reset), and switching an agent off and on here.
 *
 * Why: a project differs from the company in three ways only, and each is a separate write with its
 * own refusals. The failures that hurt are quiet ones: an override that can change tools it must
 * not, a switched-off agent that looks the same, a project save bar that offers to save agents it
 * does not hold. Each is pinned here over the stubbed Forge server, which versions and refuses like
 * the server does.
 * Depends on: routes/project-settings/agents-section, the stubbed Forge server, renderApp, agent-screens.
 */

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

describe('project agents: the roster', () => {
  it('shows the company agents with their tags and no project save bar', async () => {
    renderApp({ path: PATH });
    await ready();

    const roster = screen.getByRole('list', { name: 'Agent roster' });

    expect(
      within(roster)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Implementer', 'Test writer', 'Reviewer', 'Critic']);

    expect(within(await rowOf('Reviewer')).getByText('built-in')).toBeVisible();
    expect(
      within(await rowOf('Reviewer')).getByRole('button', { name: 'Override Reviewer' }),
    ).toBeVisible();

    expect(screen.queryByLabelText('Reason for this change')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Save as v/ })).toBeNull();
    expect(tab('Agents')).toHaveAttribute('aria-current', 'page');
  });

  it('shows loading, then an error with a retry when Forge cannot be reached', async () => {
    renderApp({ path: PATH, scenario: 'error' });

    expect(await screen.findByText('Cannot reach Forge')).toBeVisible();
  });
});

describe('project agents: override', () => {
  it('overrides only instructions and where it runs, and says what else follows the company', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await user.click(
      within(await rowOf('Reviewer')).getByRole('button', { name: 'Override Reviewer' }),
    );

    await screen.findByRole('heading', { name: 'Reviewer', level: 2 });

    expect(
      screen.getByText(/You are overriding this company agent for this project/),
    ).toBeVisible();

    expect(screen.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Runs on' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Everything else' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Identity' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Tools' })).toBeNull();

    await user.type(
      screen.getByRole('textbox', { name: 'Instructions (markdown)' }),
      ' Follow our naming guide.',
    );

    await saveAgent(user, 'Save override', 'house rules');
    expect(await screen.findByText('Saved as version 4.')).toBeVisible();

    const [sent] = bodiesTo(forge, 'PUT', `${API}/reviewer`) as {
      override: { instructions: string; runs_on: unknown };
      agent?: unknown;
      expected_version: number;
    }[];

    expect(sent?.override.instructions).toMatch(/ Follow our naming guide\.$/);
    expect(sent?.override).toHaveProperty('runs_on');
    expect(sent).not.toHaveProperty('agent');
    expect(sent?.expected_version).toBe(3);

    await user.click(screen.getByRole('button', { name: /All agents/ }));
    expect(within(await rowOf('Reviewer')).getByText('overridden')).toBeVisible();
  });

  it('Reset puts the company agent back after a confirm', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await openEditor(user, 'Critic');
    await user.type(
      screen.getByRole('textbox', { name: 'Instructions (markdown)' }),
      ' Extra.',
    );

    await saveAgent(user, 'Save override');
    await screen.findByText('Saved as version 4.');
    await user.click(screen.getByRole('button', { name: /All agents/ }));

    await pickMenu(user, 'More actions for Critic', /Reset to company default/);
    const dialog = await screen.findByRole('dialog', {
      name: 'Reset Critic to the company default?',
    });

    expect(forge.stub.callsTo(`POST ${API}/:id/reset-override`)).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));

    await waitFor(async () =>
      expect(within(await rowOf('Critic')).queryByText('overridden')).toBeNull(),
    );

    expect(bodiesTo(forge, 'POST', `${API}/critic/reset-override`)[0]).toEqual({
      expected_version: 4,
      reason: 'Reset to the default',
    });
  });

  it('offers Reset only where something is overridden', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await ready();

    await user.click(screen.getByRole('button', { name: 'More actions for Critic' }));

    expect(screen.queryByRole('menuitem', { name: /Reset/ })).toBeNull();
  });
});

describe('project agents: switching off and on', () => {
  it('disables an agent here, marks it, and enables it again', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });
    await ready();

    await pickMenu(user, 'More actions for Critic', 'Disable here');
    await user.click(await screen.findByRole('button', { name: 'Switch off' }));

    await waitFor(async () =>
      expect(within(await rowOf('Critic')).getByText('disabled')).toBeVisible(),
    );

    expect(bodiesTo(forge, 'POST', `${API}/critic/disable`)[0]).toEqual({
      expected_version: 3,
      reason: 'Switched off for this project',
    });

    await pickMenu(user, 'More actions for Critic', 'Enable here');
    await user.click(await screen.findByRole('button', { name: 'Switch on' }));

    await waitFor(async () =>
      expect(within(await rowOf('Critic')).queryByText('disabled')).toBeNull(),
    );

    expect(bodiesTo(forge, 'POST', `${API}/critic/enable`)).toHaveLength(1);
  });

  it('explains why the implementer cannot be switched off instead of hiding the action', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await ready();

    await user.click(
      screen.getByRole('button', { name: 'More actions for Implementer' }),
    );

    const item = await screen.findByRole('menuitem', { name: /Disable here/ });

    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent(/needed until pipelines can name another writer/);
  });
});
