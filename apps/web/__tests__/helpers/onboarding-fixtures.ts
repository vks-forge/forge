/**
 * Fixtures for the add-project wizard tests: what the server answers for a folder, per git state.
 *
 * Why: the wizard's steps differ by what git said about the folder (its own repository, no
 *   repository, inside someone else's), so every test needs a believable `POST /projects/inspect`
 *   answer for each, plus the routes every screen asks for around it. One place keeps the
 *   three answers consistent with the shared contract (d-0124) and the tests short.
 *
 * Exports: COMPLETE_SYSTEM, REPO_GIT, NONE_GIT, INSIDE_GIT, inspection(), BASE_ROUTES, pickRoutes(),
 *   chooseFolder(), clickNext(), toReview(), postedBody().
 * Depends on: @testing-library/react, @testing-library/user-event, helpers/fetch-stub, helpers/render-onboarding.
 */

import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { json } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { projectReply } from '#tests/helpers/render-onboarding.js';

export const COMPLETE_SYSTEM = {
  service: 'forge',
  version: '0.0.0',
  data_home: '/forge',
  first_run: { complete: true, project_count: 1, harness_ok: true },
};

const GIT_BASE = {
  repo_root: null,
  subfolder: null,
  has_commits: true,
  dirty: false,
  remote: null,
};

export const REPO_GIT = { ...GIT_BASE, state: 'repo', repo_root: '/code/billing' };

export const NONE_GIT = { ...GIT_BASE, state: 'none', has_commits: false };

export const INSIDE_GIT = {
  ...GIT_BASE,
  state: 'inside_repo',
  repo_root: '/code/mono',
  subfolder: 'apps/billing',
};

/** A `ProjectInspection` as the server sends it; `git` and `snapshot` follow the folder's git state. */
export function inspection(overrides: Record<string, unknown> = {}) {
  return {
    local_path: '/code/billing',
    current_branch: 'main',
    base_branch: 'main',
    branches: ['develop', 'main'],
    branches_truncated: false,
    ecosystems: ['node'],
    checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
    suggested_slug: 'billing',
    suggested_prefix: 'BIL',
    git: REPO_GIT,
    snapshot: null,
    ...overrides,
  };
}

/** The routes every wizard screen asks for, with an inspection that is a plain repository. */
export const BASE_ROUTES: Routes = {
  'GET /projects': { body: { projects: [projectReply('forge', 'FG')] } },
  'GET /system': { body: COMPLETE_SYSTEM },
  'GET /github/connections': { body: { connections: [] } },
  'POST /projects/inspect': { body: inspection() },
  'POST /fs/pick-folder': json({ status: 'picked', path: '/code/billing' }),
};

/** `POST /projects` answering 201 with the project the body named. */
export const CREATED: Routes = {
  'POST /projects': ({ body }) => {
    const sent = body as { slug: string; prefix: string };

    return {
      status: 201,
      body: {
        project: projectReply(sent.slug, sent.prefix),
        settings_version: 1,
      },
    };
  },
};

/** Browse, then wait for the folder to be checked: the first step's whole job. */
export async function chooseFolder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Choose a folder/ }));
  await screen.findByText(/This folder can be a project/);
}

export async function clickNext(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

/** From a chosen folder to the review step, with a name typed. */
export async function toReview(user: ReturnType<typeof userEvent.setup>) {
  await chooseFolder(user);
  await clickNext(user);
  await clickNext(user);
  await user.type(await screen.findByLabelText('Your name'), 'Vikash');
  await clickNext(user);
  await clickNext(user);
  await screen.findByRole('heading', { name: 'Review and create' });
}

/** The body of the `POST /projects` the app sent, if any. */
export const postedBody = (calls: { method: string; path: string; body: unknown }[]) =>
  calls.find((c) => c.method === 'POST' && c.path === '/projects')?.body;
