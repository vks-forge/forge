/**
 * Pins: the "Before each ticket" section of the Checks tab: detected steps shown read-only with the
 * file each came from (a Python project reads as plainly as a Node one), Customise copies them into
 * an editor, Use detected goes back to following detection, No setup saves an explicit empty list,
 * a project with no ecosystem gets plain words and a way to add a step, and a step Forge would
 * refuse is flagged beside the box before Save.
 *
 * Why: Workers cannot install packages, so what this section says is what every later ticket gets
 *   installed first (d-0180). Saying nothing and saying "none" must not look alike, no language
 *   may be assumed (d-0176), and a typo must not become a ticket that fails to start.
 * Depends on: routes/project-settings (setup-section, setup-editor), the stubbed Forge server,
 *   helpers/render-screens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderScreens } from '#tests/helpers/render-screens.js';

const CHECKS = '/p/sample-service/settings/checks';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Project settings', level: 1 });
}

const section = async (): Promise<HTMLElement> => {
  const title = await screen.findByText('Before each ticket');

  return title.closest('#setup') as HTMLElement;
};

async function save(user: ReturnType<typeof userEvent.setup>, reason: string) {
  await user.type(screen.getByLabelText('Reason for this change'), reason);
  await user.click(screen.getByRole('button', { name: 'Save as v4' }));
  await screen.findByText(/Saved as version 4/);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Before each ticket: detected', () => {
  it('shows the detected steps with the file they came from, and says why Forge installs', async () => {
    renderScreens(CHECKS);
    await ready();

    const box = await section();

    expect(
      within(box).getByText(/Workers cannot install packages, so Forge does it first/),
    ).toBeInTheDocument();

    const list = await within(box).findByRole('list', { name: 'Detected setup steps' });

    expect(list).toHaveTextContent('Install packages');
    expect(list).toHaveTextContent('pnpm install --frozen-lockfile');
    expect(list).toHaveTextContent('from pnpm-lock.yaml');
    expect(within(box).getByRole('button', { name: 'Customise' })).toBeEnabled();
    expect(within(box).getByRole('switch', { name: 'No setup' })).not.toBeChecked();
  });

  it('reads a Python project as plainly: its own command and its own file', async () => {
    renderScreens('/p/sample-web/settings/checks');
    await ready();

    const list = await within(await section()).findByRole('list', {
      name: 'Detected setup steps',
    });

    expect(list).toHaveTextContent('uv sync --frozen');
    expect(list).toHaveTextContent('from uv.lock');
    expect(list).not.toHaveTextContent(/npm|pnpm/);
  });

  it('says no steps were detected for a project in no known ecosystem, and offers to add one', async () => {
    const user = userEvent.setup();
    renderScreens('/p/sample-docs/settings/checks');
    await ready();

    const box = await section();

    expect(await within(box).findByText(/No setup steps detected/)).toBeInTheDocument();
    expect(within(box).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(within(box).getByRole('button', { name: 'Add a step' }));

    expect(within(box).getByLabelText('Setup step 1 command')).toHaveValue('');
  });

  it('says so, with a way to try again, when Forge could not look', async () => {
    renderScreens(CHECKS, {
      routes: {
        'GET /projects/:slug/detected': {
          status: 500,
          body: { error: { code: 'internal', message: 'boom' } },
        },
      },
    });

    await ready();

    const box = await section();

    expect(await within(box).findByRole('alert')).toHaveTextContent(
      /Could not look at the project’s files/,
    );

    expect(within(box).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('scrolls itself into view when opened by the escalation card’s link', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderScreens(`${CHECKS}#setup`);
    await ready();
    await section();

    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });
});

describe('Before each ticket: customised', () => {
  it('copies the detected steps into the editor and saves the edited step', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));

    const command = within(box).getByLabelText('Setup step 1 command');

    expect(command).toHaveValue('pnpm install --frozen-lockfile');
    expect(within(box).getByLabelText('Setup step 1 name')).toHaveValue(
      'Install packages',
    );

    await user.clear(command);
    await user.type(command, 'pnpm install --offline --frozen-lockfile');
    await save(user, 'work offline');

    const { override } = await api.projectSettings.get('sample-service');

    expect(override['setup']).toEqual([
      expect.objectContaining({
        name: 'Install packages',
        command: 'pnpm install --offline --frozen-lockfile',
        inputs: ['pnpm-lock.yaml', 'package.json'],
        timeout_minutes: 20,
      }),
    ]);
  });

  it('keeps the rarer knobs behind Advanced, with a time limit', async () => {
    const user = userEvent.setup();
    renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));

    expect(within(box).queryByLabelText('Time limit (minutes)')).not.toBeInTheDocument();

    await user.click(
      within(box).getByRole('button', { name: 'Advanced options for step 1' }),
    );

    expect(within(box).getByLabelText('Time limit (minutes)')).toHaveValue('20');
    expect(within(box).getByLabelText('Files that make this step run again')).toHaveValue(
      'pnpm-lock.yaml\npackage.json',
    );

    expect(
      within(box).getByLabelText('Folders to put first on PATH'),
    ).toBeInTheDocument();

    expect(
      within(box).getByLabelText('Variables to pass from this computer'),
    ).toBeInTheDocument();
  });

  it('Use detected drops the edits and saves nothing for setup', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));
    await user.type(within(box).getByLabelText('Setup step 1 name'), ' again');
    await user.click(within(box).getByRole('button', { name: 'Use detected' }));

    expect(
      await within(box).findByRole('list', { name: 'Detected setup steps' }),
    ).toHaveTextContent('Install packages');

    // Nothing is left to save once the edits are dropped.
    expect(screen.queryByLabelText('Reason for this change')).not.toBeInTheDocument();
    expect((await api.projectSettings.get('sample-service')).override).not.toHaveProperty(
      'setup',
    );
  });

  it('flags a folder outside the repository beside the box and holds Save', async () => {
    const user = userEvent.setup();
    renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));
    await user.type(within(box).getByLabelText('Setup step 1 folder'), '/etc');

    expect(await within(box).findByRole('alert')).toHaveTextContent(
      /inside the repository/,
    );

    await user.type(screen.getByLabelText('Reason for this change'), 'try');

    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();
  });

  it('refuses two steps with the same name', async () => {
    const user = userEvent.setup();
    renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));
    await user.click(within(box).getByRole('button', { name: 'Add setup step' }));
    await user.type(within(box).getByLabelText('Setup step 2 name'), 'Install packages');
    await user.type(within(box).getByLabelText('Setup step 2 command'), 'make deps');

    expect(await within(box).findByRole('alert')).toHaveTextContent(/must be unique/);
  });
});

describe('Before each ticket: No setup', () => {
  it('saves an explicit empty list, which is not the same as saying nothing', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('switch', { name: 'No setup' }));

    expect(
      within(box).getByText(/checks that need packages will fail/),
    ).toBeInTheDocument();

    await save(user, 'no installs here');

    expect((await api.projectSettings.get('sample-service')).override['setup']).toEqual(
      [],
    );

    expect(
      within(await section()).getByRole('switch', { name: 'No setup' }),
    ).toBeChecked();
  });

  it('switching it off again goes back to the detected steps', async () => {
    const user = userEvent.setup();
    renderScreens(CHECKS);
    await ready();

    const box = await section();
    await user.click(await within(box).findByRole('switch', { name: 'No setup' }));
    await user.click(within(box).getByRole('switch', { name: 'No setup' }));

    expect(
      await within(box).findByRole('list', { name: 'Detected setup steps' }),
    ).toBeInTheDocument();
  });
});
