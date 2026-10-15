/**
 * Pins: the first-run wizard: when `/` sends a person to it, where it opens, how its four
 * steps move, "Finish later", and the first project made from it, on stubbed server answers.
 *
 * Why: first run is the first thing a new user sees. A fresh Forge that lands on an empty
 * list, a wizard that restarts from the top after a harness already works, a "Finish later"
 * that `/` ignores, or a project step that creates before the folder was checked each lose
 * the person at the moment they are deciding whether Forge works. Each case runs the shipped
 * routes and the real http adapter against `stubFetch`.
 * Depends on: routes/welcome, routes/root-redirect, helpers/render-onboarding, helpers/fetch-stub.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import {
  projectReply,
  renderOnboarding,
  SYSTEM_FRESH,
} from '#tests/helpers/render-onboarding.js';

const NO_PROJECTS = { 'GET /projects': { body: { projects: [] } } };
const NO_HARNESSES = { 'GET /harnesses': { body: { harnesses: [], paused: [] } } };
const NO_CONNECTIONS = { 'GET /github/connections': { body: { connections: [] } } };

const INSPECTION = {
  local_path: '/home/me/my-app',
  current_branch: 'main',
  base_branch: 'main',
  branches: ['develop', 'main'],
  branches_truncated: false,
  ecosystems: ['node'],
  checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
  suggested_slug: 'my-app',
  suggested_prefix: 'MA',
};

describe('first run: when the wizard opens', () => {
  it('sends a fresh install from / to the first step, naming the data folder', async () => {
    const { router } = renderOnboarding('/', {
      ...NO_PROJECTS,
      'GET /system': { body: SYSTEM_FRESH },
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Where Forge keeps its files',
        level: 1,
      }),
    ).toBeInTheDocument();

    expect(router.state.location.pathname).toBe('/welcome');
    expect(screen.getByLabelText('Data folder')).toHaveTextContent(
      SYSTEM_FRESH.data_home,
    );

    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  it('opens past the harness step once the server says a harness works', async () => {
    renderOnboarding('/welcome', {
      ...NO_CONNECTIONS,
      'GET /system': {
        body: {
          ...SYSTEM_FRESH,
          first_run: { ...SYSTEM_FRESH.first_run, harness_ok: true },
        },
      },
    });

    expect(
      await screen.findByRole('heading', { name: 'Connect GitHub', level: 1 }),
    ).toBeInTheDocument();
  });

  it('opens the project when setup is already complete', async () => {
    const { router } = renderOnboarding('/', {
      'GET /projects': { body: { projects: [projectReply('my-app', 'MA')] } },
      'GET /system': {
        body: {
          ...SYSTEM_FRESH,
          first_run: { complete: true, project_count: 1, harness_ok: true },
        },
      },
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/my-app'));
  });

  it('stops sending the user back after "Finish later", and offers a way back in', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding('/welcome', {
      ...NO_PROJECTS,
      ...NO_HARNESSES,
      'GET /system': { body: SYSTEM_FRESH },
    });

    await user.click(await screen.findByRole('button', { name: 'Finish later' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/settings/harnesses'),
    );

    expect(JSON.parse(localStorage.getItem('forge.ui.welcome') ?? '{}').state).toEqual({
      step: null,
      dismissed: true,
    });

    await router.navigate('/');

    expect(
      await screen.findByRole('heading', { name: 'No projects yet' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Add project' })).toHaveAttribute(
      'href',
      '/projects/new',
    );

    expect(screen.getByRole('link', { name: 'Resume setup' })).toBeInTheDocument();
  });

  it('shows why when Forge cannot be reached, with a retry', async () => {
    renderOnboarding('/welcome', {});

    expect(await screen.findByText('Forge reported a problem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('first run: moving through the steps', () => {
  it('goes data, harness, GitHub (skippable), project, and Esc goes back one step', async () => {
    const user = userEvent.setup();
    renderOnboarding('/welcome', {
      ...NO_HARNESSES,
      ...NO_CONNECTIONS,
      'GET /system': { body: SYSTEM_FRESH },
    });

    await screen.findByRole('heading', { name: 'Where Forge keeps its files' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', { name: 'Harnesses and logins', level: 1 }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole('button', { name: 'Register claude' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Connect GitHub', level: 1 });

    await user.click(
      await screen.findByRole('button', { name: /Skip: use local git only/ }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Your first project', level: 1 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Connect GitHub', level: 1 });

    await user.keyboard('{Escape}');
    expect(
      await screen.findByRole('heading', { name: 'Harnesses and logins', level: 1 }),
    ).toBeInTheDocument();
  });
});

describe('first run: the first project', () => {
  async function toProjectStep(extra = {}) {
    const user = userEvent.setup();
    let projects: unknown[] = [];
    const rendered = renderOnboarding('/welcome', {
      'GET /projects': () => ({ body: { projects } }),
      'GET /system': {
        body: {
          ...SYSTEM_FRESH,
          first_run: { ...SYSTEM_FRESH.first_run, harness_ok: true },
        },
      },
      ...NO_CONNECTIONS,
      ...extra,
      'POST /projects': () => {
        projects = [projectReply('my-app', 'MA')];

        return {
          status: 201,
          body: { project: projectReply('my-app', 'MA'), settings_version: 1 },
        };
      },
    });

    await user.click(
      await screen.findByRole('button', { name: /Skip: use local git only/ }),
    );

    await screen.findByRole('heading', { name: 'Your first project' });

    return { user, ...rendered };
  }

  it('checks the folder with Enter, shows what it found, then creates and opens the project', async () => {
    const { user, router, calls } = await toProjectStep({
      'POST /projects/inspect': { body: INSPECTION },
    });

    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Repository folder'), '/home/me/my-app{Enter}');

    expect(await screen.findByText('This folder can be a project')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/projects/inspect')[0]?.body).toEqual({
      local_path: '/home/me/my-app',
    });

    expect(screen.getByLabelText('Project name')).toHaveValue('my-app');
    expect(screen.getByLabelText('Ticket prefix')).toHaveValue('MA');
    expect(screen.getByLabelText('Base branch')).toHaveValue('main');
    expect(screen.getByLabelText('Check 1 command')).toHaveValue('npm run test');

    await user.type(screen.getByLabelText('Remote repository'), '../my-app.git');
    await user.type(screen.getByLabelText('Your name'), 'Vikash');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/my-app'));
    expect(
      calls.find((c) => c.method === 'POST' && c.path === '/projects')?.body,
    ).toEqual({
      slug: 'my-app',
      prefix: 'MA',
      local_path: '/home/me/my-app',
      base_branch: 'main',
      git_host: { kind: 'local', remote_path: '../my-app.git', base_branch: 'main' },
      settings: { checks: [{ name: 'test', role: 'test', command: 'npm run test' }] },
      author: 'Vikash',
      reason: 'project created in the web app',
    });
  });

  it('refuses a folder inside a repository next to the box, with what to do', async () => {
    const { user } = await toProjectStep({
      'POST /projects/inspect': refusal(
        400,
        'not_repository_root',
        'x is inside a repository whose root is y',
      ),
    });

    await user.type(
      screen.getByLabelText('Repository folder'),
      '/home/me/my-app/src{Enter}',
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('inside a repository');
    expect(alert).toHaveTextContent('Choose the top folder of the repository');
    expect(screen.getByLabelText('Repository folder')).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
  });

  it('hides the details again when the folder is edited after the check', async () => {
    const { user } = await toProjectStep({
      'POST /projects/inspect': { body: INSPECTION },
    });

    await user.type(screen.getByLabelText('Repository folder'), '/home/me/my-app{Enter}');
    await screen.findByLabelText('Project name');

    await user.type(screen.getByLabelText('Repository folder'), 'x');

    await waitFor(() =>
      expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument(),
    );
  });

  it('catches a missing name before sending anything', async () => {
    const { user, calls } = await toProjectStep({
      'POST /projects/inspect': { body: INSPECTION },
    });

    await user.type(screen.getByLabelText('Repository folder'), '/home/me/my-app{Enter}');
    await screen.findByLabelText('Project name');
    await user.type(screen.getByLabelText('Remote repository'), '../my-app.git');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(
      await screen.findByText(/Say who is creating the project/),
    ).toBeInTheDocument();

    expect(calls.some((c) => c.method === 'POST' && c.path === '/projects')).toBe(false);
  });
});
