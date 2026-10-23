/**
 * Pins: the Project tab lists the detected ecosystems and "Detect again" looks at the folder now:
 * it shows that it is working, records and shows what it found, and says plainly when it could not
 * look, keeping the old answer.
 *
 * Why: Forge looks at a folder once, when the project is registered. A project that gained a
 *   lockfile since, or was registered before ecosystems were recorded, would otherwise be stuck
 *   with a wrong or empty list and no way to fix it short of the database (d-0176, d-0180).
 * Depends on: routes/project-settings/project-section, api/use-detected, helpers/render-screens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PROJECT = '/p/sample-web/settings/project';

const facts = async (): Promise<HTMLElement> =>
  (await screen.findByText('Detected ecosystems')).parentElement as HTMLElement;

describe('Project tab: Detect again', () => {
  it('looks again, shows what it found and updates the listed ecosystems', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PROJECT);

    expect(await facts()).toHaveTextContent('node');

    await user.click(await screen.findByRole('button', { name: 'Detect again' }));

    expect(await screen.findByText('Looked again: python.')).toBeInTheDocument();
    expect(forge.stub.callsTo('POST /projects/:slug/detected')).toHaveLength(1);
    expect(await within(await facts()).findByText('python')).toBeInTheDocument();
  });

  it('says so when the folder has no ecosystem, without calling it an error', async () => {
    const user = userEvent.setup();
    renderScreens('/p/sample-docs/settings/project');

    await user.click(await screen.findByRole('button', { name: 'Detect again' }));

    expect(await screen.findByText('Looked again: no ecosystem found.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a busy button while it looks', async () => {
    const user = userEvent.setup();
    renderScreens(PROJECT, {
      routes: {
        'POST /projects/:slug/detected': {
          status: 200,
          delayMs: 200,
          body: { ecosystems: ['python'], checks: [], setup: [] },
        },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Detect again' }));

    expect(screen.getByRole('button', { name: 'Detect again' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    expect(await screen.findByText('Looked again: python.')).toBeInTheDocument();
  });

  it('explains a failure and keeps the old list', async () => {
    const user = userEvent.setup();
    renderScreens(PROJECT, {
      routes: {
        'POST /projects/:slug/detected': {
          status: 500,
          body: { error: { code: 'internal', message: 'boom' } },
        },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Detect again' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Could not look at the folder/,
    );

    expect(await facts()).toHaveTextContent('node');
    expect(screen.getByRole('button', { name: 'Detect again' })).toBeEnabled();
  });
});
