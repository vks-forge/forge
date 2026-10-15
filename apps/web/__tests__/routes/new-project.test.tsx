/**
 * Pins: "Add project" for later projects: the switcher entry, the page inside the shell, a
 * GitHub-hosted create, and each server refusal shown beside its field.
 *
 * Why: after setup, adding a second repository is the common path. It must be reachable from
 * the switcher, use the same careful check-then-create order as the first run, send the
 * connection (not a host) when GitHub is chosen, and turn a taken prefix or name into advice
 * beside the box that is wrong instead of a bare error.
 * Depends on: routes/projects/new-project-page, components/shell/project-switcher,
 *   helpers/render-onboarding, helpers/fetch-stub.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { projectReply, renderOnboarding } from '#tests/helpers/render-onboarding.js';

const COMPLETE = {
  service: 'forge',
  version: '0.0.0',
  data_home: '/forge',
  first_run: { complete: true, project_count: 1, harness_ok: true },
};

const INSPECTION = {
  local_path: '/code/billing',
  current_branch: 'main',
  base_branch: 'main',
  branches: ['main'],
  branches_truncated: false,
  ecosystems: [],
  checks: [],
  suggested_slug: 'billing',
  suggested_prefix: 'BIL',
};

const BASE = {
  'GET /projects': { body: { projects: [projectReply('forge', 'FG')] } },
  'GET /system': { body: COMPLETE },
  'POST /projects/inspect': { body: INSPECTION },
};

const CONNECTIONS = {
  'GET /github/connections': {
    body: {
      connections: [
        {
          id: 'acme',
          account: 'Acme Inc',
          app_id: '4242',
          key_secret_name: 'github/acme/key',
          status: 'active',
          created_at: '2026-10-14T00:00:00.000Z',
        },
      ],
    },
  },
};

async function checked(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText('Repository folder'),
    '/code/billing{Enter}',
  );

  await screen.findByLabelText('Project name');
}

describe('add project', () => {
  it('opens from the project switcher', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding('/p/forge', { ...BASE });

    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/new'));
    expect(
      await screen.findByRole('heading', { name: 'Add project', level: 1 }),
    ).toBeInTheDocument();
  });

  it('creates a GitHub project with the connection, not a host, and opens it', async () => {
    const user = userEvent.setup();
    const { router, calls } = renderOnboarding('/projects/new', {
      ...BASE,
      ...CONNECTIONS,
      'POST /projects': {
        status: 201,
        body: { project: projectReply('billing', 'BIL'), settings_version: 1 },
      },
    });

    await checked(user);
    await user.click(screen.getByRole('radio', { name: /GitHub/ }));
    await user.selectOptions(await screen.findByLabelText('GitHub connection'), 'acme');
    await user.type(screen.getByLabelText('Repository'), 'acme/billing');
    await user.type(screen.getByLabelText('Installation id'), '99');
    await user.type(screen.getByLabelText('Your name'), 'Vikash');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/billing'));
    const body = calls.find((c) => c.method === 'POST' && c.path === '/projects')?.body;
    expect(body).toMatchObject({
      slug: 'billing',
      connection_id: 'acme',
      repo_full_name: 'acme/billing',
      installation_id: '99',
    });

    expect(body).not.toHaveProperty('git_host');
  });

  it.each([
    [
      'prefix_in_use',
      409,
      'Another project already uses that ticket prefix',
      'project-prefix',
    ],
    ['project_exists', 409, 'A project with that name already exists', 'project-slug'],
    ['base_branch_missing', 400, 'That branch does not exist', 'project-branch'],
    [
      'project_not_servable',
      400,
      'Forge could not use that remote folder',
      'project-remote',
    ],
  ])('shows %s beside its own field with a fix', async (code, status, words, fieldId) => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...BASE,
      'POST /projects': refusal(status, code, 'server words'),
    });

    await checked(user);
    await user.type(screen.getByLabelText('Remote repository'), '../billing.git');
    await user.type(screen.getByLabelText('Your name'), 'Vikash');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const error = await screen.findByText(new RegExp(words));
    expect(error).toHaveAttribute('id', `${fieldId}-error`);
    expect(document.getElementById(fieldId)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a refusal that belongs to the folder under the folder box', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...BASE,
      'POST /projects': refusal(409, 'path_in_use', 'dup'),
    });

    await checked(user);
    await user.type(screen.getByLabelText('Remote repository'), '../billing.git');
    await user.type(screen.getByLabelText('Your name'), 'Vikash');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const alert = await screen.findByText(/Another project already uses this folder/);
    expect(
      within(alert.parentElement as HTMLElement).getByText(/Open that project/),
    ).toBeTruthy();
  });

  it('explains that GitHub needs a connection when there is none', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...BASE,
      'GET /github/connections': { body: { connections: [] } },
    });

    await checked(user);
    await user.click(screen.getByRole('radio', { name: /GitHub/ }));

    expect(
      await screen.findByText(/no active GitHub connection yet/),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: 'Add one in Forge settings' }),
    ).toHaveAttribute('href', '/settings/github');
  });
});
