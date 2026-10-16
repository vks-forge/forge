/**
 * Pins: each server refusal of "Add project" shown on the step that holds the field, a refusal
 * about the folder sent back to the folder step, the review step's Edit links, and progress while
 * creating.
 *
 * Why: a refusal (a taken prefix, a name that exists, a folder in use, a snapshot too big) arrives
 * only when the person presses Create on the last step. It must land beside the box that is wrong,
 * even when that box is on an earlier step, in words with a fix, and creating must show that it is
 * working and cannot be walked away from half-sent.
 * Depends on: routes/projects/new-project-page, helpers/render-onboarding, helpers/onboarding-fixtures,
 *   helpers/fetch-stub.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { BASE_ROUTES, CREATED, toReview } from '#tests/helpers/onboarding-fixtures.js';
import { projectReply, renderOnboarding } from '#tests/helpers/render-onboarding.js';

const ROUTES = { ...BASE_ROUTES, ...CREATED };

describe('add project: refusals go to the step that shows the field', () => {
  it.each([
    [
      'prefix_in_use',
      409,
      'Another project already uses that ticket prefix',
      'project-prefix',
    ],
    ['project_exists', 409, 'A project with that name already exists', 'project-slug'],
    ['base_branch_missing', 400, 'That branch does not exist', 'project-branch'],
  ])('shows %s beside its own field with a fix', async (code, status, words, fieldId) => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects': refusal(status, code, 'server words'),
    });

    await toReview(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const error = await screen.findByText(new RegExp(words));
    expect(error).toHaveAttribute('id', `${fieldId}-error`);
    expect(document.getElementById(fieldId)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Name the project' })).toBeInTheDocument();
  });

  it('sends a refusal about the folder back to the folder step', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects': refusal(409, 'path_in_use', 'dup'),
    });

    await toReview(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(
      await screen.findByText(/Another project already uses this folder/),
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Choose a folder' })).toBeInTheDocument();
  });

  it('shows a refusal no field owns on the review step', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects': refusal(413, 'snapshot_too_large', 'over 20000 files'),
    });

    await toReview(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(
      await screen.findByText('This folder is too large for a first snapshot.'),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Review and create' }),
    ).toBeInTheDocument();
  });

  it('lets the review step jump back to edit one part', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', { ...ROUTES });

    await toReview(user);
    await user.click(screen.getByRole('button', { name: 'Edit checks' }));

    expect(await screen.findByRole('heading', { name: 'Checks' })).toBeInTheDocument();
  });

  it('shows progress while creating and locks closing', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects': {
        status: 201,
        body: { project: projectReply('billing', 'BIL'), settings_version: 1 },
        delayMs: 300,
      },
    });

    await toReview(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('Creating the project…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
