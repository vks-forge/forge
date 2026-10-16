/**
 * Pins: what "Add project" sends and where it sends the person on a refusal: the git setup or scope
 * the folder needs (snapshot or init only, repository top or subfolder), GitHub only for a GitHub
 * remote, and each server refusal shown on the step that holds the field.
 *
 * Why: the dialog works on any folder, with or without git (d-0124). The body it sends must carry
 * exactly the choice the folder needs and never a host the folder does not have, and a refusal
 * (a taken prefix, a folder already in use, a snapshot too big) must land beside the box that is
 * wrong, even when that box is on an earlier step.
 * Depends on: routes/projects/new-project-page, helpers/render-onboarding, helpers/onboarding-fixtures,
 *   helpers/fetch-stub.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import {
  BASE_ROUTES,
  chooseFolder,
  clickNext,
  CREATED,
  postedBody,
  toReview,
  inspection,
  INSIDE_GIT,
  NONE_GIT,
  REPO_GIT,
} from '#tests/helpers/onboarding-fixtures.js';
import { renderOnboarding } from '#tests/helpers/render-onboarding.js';

const ROUTES = { ...BASE_ROUTES, ...CREATED };

describe('add project: git choices in the body', () => {
  it('creates a project from an existing repository with no git setup or scope, then opens it', async () => {
    const user = userEvent.setup();
    const { router, calls } = renderOnboarding('/projects/new', { ...ROUTES });

    await toReview(user);

    expect(screen.getByText('/code/billing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/billing'));
    expect(postedBody(calls)).toEqual({
      slug: 'billing',
      prefix: 'BIL',
      local_path: '/code/billing',
      base_branch: 'main',
      settings: { checks: [{ name: 'test', role: 'test', command: 'npm run test' }] },
      author: 'Vikash',
      reason: 'project created in the web app',
    });
  });

  it('explains a folder with no git and sends a snapshot by default', async () => {
    const user = userEvent.setup();
    const { router, calls } = renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects/inspect': {
        body: inspection({
          current_branch: null,
          branches: [],
          git: NONE_GIT,
          snapshot: {
            files: 1234,
            bytes: 52_428_800,
            has_gitignore: false,
            truncated: false,
          },
        }),
      },
    });

    await chooseFolder(user);
    await clickNext(user);

    expect(
      await screen.findByText('This folder is not a git repository yet'),
    ).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: /Snapshot commit/ })).toBeChecked();
    expect(screen.getByText(/1,234 files already here \(50 MB\)/)).toBeInTheDocument();
    expect(screen.getByText(/standard \.gitignore is added/)).toBeInTheDocument();

    await clickNext(user);
    await user.type(await screen.findByLabelText('Your name'), 'Vikash');
    await clickNext(user);
    await clickNext(user);

    expect(screen.getByText(/commit a snapshot of 1,234 files/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/billing'));
    expect(postedBody(calls)).toMatchObject({ git_setup: { mode: 'snapshot' } });
    expect(postedBody(calls)).not.toHaveProperty('scope');
  });

  it('sends init only when the person picks it', async () => {
    const user = userEvent.setup();
    const { calls } = renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects/inspect': {
        body: inspection({
          branches: [],
          git: NONE_GIT,
          snapshot: { files: 3, bytes: 900, has_gitignore: true, truncated: false },
        }),
      },
    });

    await chooseFolder(user);
    await clickNext(user);
    await user.click(await screen.findByRole('radio', { name: /Init only/ }));
    await clickNext(user);
    await user.type(await screen.findByLabelText('Your name'), 'Vikash');
    await clickNext(user);
    await clickNext(user);

    expect(screen.getByText(/empty local repository/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(postedBody(calls)).toBeDefined());
    expect(postedBody(calls)).toMatchObject({ git_setup: { mode: 'init_only' } });
  });

  it('offers the repository top by default for a folder inside a repository and registers it', async () => {
    const user = userEvent.setup();
    const { calls } = renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects/inspect': {
        body: inspection({ local_path: '/code/mono/apps/billing', git: INSIDE_GIT }),
      },
    });

    await chooseFolder(user);
    await clickNext(user);

    expect(
      await screen.findByText('This folder is inside a git repository'),
    ).toBeInTheDocument();

    const top = screen.getByRole('radio', { name: /top folder/ });
    expect(top).toBeChecked();
    expect(screen.getByText('/code/mono')).toBeInTheDocument();

    await clickNext(user);
    await user.type(await screen.findByLabelText('Your name'), 'Vikash');
    await clickNext(user);
    await clickNext(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(postedBody(calls)).toBeDefined());
    expect(postedBody(calls)).toMatchObject({
      local_path: '/code/mono',
      scope: { mode: 'root' },
    });
  });

  it('scopes the project to the subfolder when asked', async () => {
    const user = userEvent.setup();
    const { calls } = renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects/inspect': {
        body: inspection({ local_path: '/code/mono/apps/billing', git: INSIDE_GIT }),
      },
    });

    await chooseFolder(user);
    await clickNext(user);
    await user.click(await screen.findByRole('radio', { name: /Only this subfolder/ }));
    await clickNext(user);
    await user.type(await screen.findByLabelText('Your name'), 'Vikash');
    await clickNext(user);
    await clickNext(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(postedBody(calls)).toBeDefined());
    expect(postedBody(calls)).toMatchObject({
      local_path: '/code/billing',
      scope: { mode: 'subfolder' },
    });
  });

  it('offers GitHub only for a GitHub remote, and then sends the connection', async () => {
    const user = userEvent.setup();
    const { calls } = renderOnboarding('/projects/new', {
      ...ROUTES,
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
      'POST /projects/inspect': {
        body: inspection({
          git: {
            ...REPO_GIT,
            remote: {
              name: 'origin',
              url: 'https://github.com/acme/billing.git',
              github: { owner: 'acme', repo: 'billing' },
            },
          },
        }),
      },
    });

    await chooseFolder(user);
    await clickNext(user);

    expect(await screen.findByRole('radio', { name: /Merge locally/ })).toBeChecked();
    expect(screen.queryByLabelText('GitHub connection')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Pull requests on GitHub/ }));
    await choose(user, 'GitHub connection', /Acme/);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.type(screen.getByLabelText('Installation id'), '99');
    await clickNext(user);
    await user.type(await screen.findByLabelText('Your name'), 'Vikash');
    await clickNext(user);
    await clickNext(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(postedBody(calls)).toBeDefined());
    expect(postedBody(calls)).toMatchObject({
      connection_id: 'acme',
      repo_full_name: 'acme/billing',
      installation_id: '99',
    });
  });

  it('does not offer GitHub for a remote that is not on GitHub', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects/inspect': {
        body: inspection({
          git: {
            ...REPO_GIT,
            remote: { name: 'origin', url: 'git@git.example.com:me/x.git', github: null },
          },
        }),
      },
    });

    await chooseFolder(user);
    await clickNext(user);

    expect(await screen.findByText(/git\.example\.com/)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /GitHub/ })).not.toBeInTheDocument();
  });
});
