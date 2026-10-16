/**
 * Pins: "Add project" as a large step-by-step dialog: reachable from the switcher, no folder
 * text box, each step validated before Next, the git choices sent in the body, refusals sent back
 * to the step that shows the field, and closing that never throws work away by accident.
 *
 * Why: after setup, adding a second project is the common path, and it now works on any folder,
 * with or without git (d-0124). The dialog must ask one thing at a time, never let Next pass an
 * invalid step, send exactly the git setup or scope the folder needs (and never a host the folder
 * does not have), turn a taken prefix into advice beside the box that is wrong, and keep a
 * half-made choice safe from a stray click on the dimmed page.
 * Depends on: routes/projects/new-project-page, components/shell/project-switcher,
 *   helpers/render-onboarding, helpers/onboarding-fixtures, helpers/fetch-stub.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import {
  BASE_ROUTES,
  chooseFolder,
  clickNext,
  CREATED,
} from '#tests/helpers/onboarding-fixtures.js';
import { renderOnboarding } from '#tests/helpers/render-onboarding.js';

const ROUTES = { ...BASE_ROUTES, ...CREATED };

describe('add project: the dialog', () => {
  it('opens from the project switcher as a dialog, with no folder text box', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding('/p/forge', { ...ROUTES });

    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/new'));
    const dialog = await screen.findByRole('dialog', { name: 'Add project' });

    expect(
      within(dialog).getByRole('heading', { name: 'Choose a folder' }),
    ).toBeInTheDocument();

    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Repository folder')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('numbers the steps and marks the current one', async () => {
    renderOnboarding('/projects/new', { ...ROUTES });

    const steps = await screen.findByRole('navigation', { name: 'Add project steps' });

    expect(within(steps).getAllByRole('listitem')).toHaveLength(5);
    expect(within(steps).getByRole('button', { name: /Folder/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('asks before discarding a chosen folder, and stays open until the person decides', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding('/projects/new', { ...ROUTES });

    await chooseFolder(user);
    await user.keyboard('{Escape}');

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard this new project?' }),
    ).toBeInTheDocument();

    expect(router.state.location.pathname).toBe('/projects/new');
    expect(
      screen.getByRole('dialog', { name: 'Add project', hidden: true }),
    ).toBeInTheDocument();
  });

  it('closes at once when nothing was chosen', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding('/projects/new', { ...ROUTES });

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/projects/new'));
  });
});

describe('add project: step validation', () => {
  it('keeps Next off until the folder is checked, and says so when Forge cannot use it', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /projects/inspect': refusal(400, 'path_in_data_home', 'inside data home'),
    });

    await user.click(await screen.findByRole('button', { name: /Choose a folder/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "inside Forge's own data folder",
    );

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('catches a prefix another project uses while typing and blocks Next', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', { ...ROUTES });

    await chooseFolder(user);
    await clickNext(user);
    await clickNext(user);

    const prefix = await screen.findByLabelText('Ticket prefix');
    await user.clear(prefix);
    await user.type(prefix, 'fg');

    expect(
      await screen.findByText(/Another project already uses that ticket prefix/),
    ).toHaveAttribute('id', 'project-prefix-error');

    expect(prefix).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.clear(prefix);
    await user.type(prefix, 'bil');

    await user.type(screen.getByLabelText('Your name'), 'V');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('asks for the name before leaving the details, and does not open covered in errors', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', { ...ROUTES });

    await chooseFolder(user);
    await clickNext(user);
    await clickNext(user);

    expect(await screen.findByLabelText('Project name')).toHaveValue('billing');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.type(screen.getByLabelText('Your name'), 'x{Backspace}');

    expect(
      await screen.findByText(/Say who is creating the project/),
    ).toBeInTheDocument();
  });

  it('moves on with Enter when the step is valid', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', { ...ROUTES });

    await chooseFolder(user);
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Git setup' })).toBeInTheDocument();
  });

  it('goes back to an earlier step from the stepper, keeping what was typed', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', { ...ROUTES });

    await chooseFolder(user);
    await clickNext(user);
    await clickNext(user);
    const name = await screen.findByLabelText('Project name');
    await user.clear(name);
    await user.type(name, 'renamed');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Git setup' });
    await clickNext(user);

    expect(await screen.findByLabelText('Project name')).toHaveValue('renamed');
  });
});
