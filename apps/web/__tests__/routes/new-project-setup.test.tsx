/**
 * Pins: the checks step of "Add project" says, in one read-only line, what Forge will run before
 * each ticket (the detected setup steps, in whatever language) and that it can be changed later in
 * settings, and says nothing when no step was detected.
 *
 * Why: the owner is about to create a project whose Workers cannot install packages, so Forge will
 *   install them first (d-0180). They should see that once, in the commands the project's own
 *   language uses (d-0176), without a decision to make and without a line that promises something
 *   when nothing was found.
 * Depends on: routes/projects/new-project-page, components/onboarding/step-checks,
 *   helpers/render-onboarding, helpers/onboarding-fixtures.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  BASE_ROUTES,
  chooseFolder,
  clickNext,
  CREATED,
  inspection,
} from '#tests/helpers/onboarding-fixtures.js';
import { renderOnboarding } from '#tests/helpers/render-onboarding.js';

const step = (name: string, command: string, inputs: string[]) => ({
  name,
  command,
  inputs,
  env: {},
  pass_env: [],
  path: [],
  timeout_minutes: 20,
});

async function toChecks(setup: unknown[]) {
  const user = userEvent.setup();
  renderOnboarding('/projects/new', {
    ...BASE_ROUTES,
    ...CREATED,
    'POST /projects/inspect': { body: inspection({ setup }) },
  });

  await chooseFolder(user);
  await clickNext(user);
  await clickNext(user);
  await user.type(await screen.findByLabelText('Your name'), 'Vikash');
  await clickNext(user);
  await screen.findByRole('button', { name: 'Add check' });
}

describe('add project: before each ticket', () => {
  it('shows the commands Forge will run, whatever the language, as one read-only line', async () => {
    await toChecks([
      step('Create environment', 'python -m venv .venv', ['requirements.txt']),
      step('Install packages', 'uv sync --frozen', ['uv.lock']),
    ]);

    const line = screen.getByText('Before each ticket Forge will run:').parentElement;

    expect(line).toHaveTextContent('python -m venv .venv, uv sync --frozen');
    expect(line).toHaveTextContent(/You can change this later in project settings/);
    expect(line?.querySelector('input, textarea, button')).toBeNull();
  });

  it('says nothing about setup when none was detected', async () => {
    await toChecks([]);

    expect(
      screen.queryByText(/Before each ticket Forge will run/),
    ).not.toBeInTheDocument();
  });
});
