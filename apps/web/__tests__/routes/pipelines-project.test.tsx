/**
 * Pins: a project's Pipelines tab: lanes that follow the company until changed, "Changed from
 * company default", Reset back to the company default, and that a project save never touches the
 * company.
 *
 * Why: a project change must never leak into the company or the other way round: the owner has
 * to see which lanes are the project's own and put one back with one action.
 * Depends on: routes/project-settings/pipelines-section, the stubbed Forge server, renderApp.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  addStageOf,
  openLane,
  saveLane,
  sentTo,
  stageNames,
} from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { SAVE_REASON } from '#tests/helpers/pipeline-lists.js';

const PATH = '/p/sample-service/settings/pipelines';
const API = '/settings/projects/sample-service';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Pipelines for this project', level: 2 });
  await screen.findByRole('tablist', { name: 'Lane' });
}

const panel = (): HTMLElement => screen.getByRole('tabpanel');

describe('project pipelines: lanes', () => {
  it('has its own tab in project settings and shows the company lanes as the default', async () => {
    renderApp({ path: PATH });
    await ready();

    expect(
      within(
        screen.getByRole('navigation', { name: 'Project settings sections' }),
      ).getByRole('link', { name: 'Pipelines' }),
    ).toHaveAttribute('aria-current', 'page');

    expect(within(panel()).getByText('Same as company default')).toBeVisible();
    expect(await stageNames('Express')).toEqual(['Implement', 'Gate G1', 'Merge']);
    expect(screen.getByRole('button', { name: 'Reset Express' })).toBeDisabled();
    expect(screen.queryByLabelText('Reason for this change (required)')).toBeNull();
  });

  it('saves a lane for this project, marks it changed and then resets it to the company default', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });

    await ready();
    await openLane(user, 'Standard');
    await user.click(await screen.findByRole('button', { name: 'Remove Review' }));
    await saveLane(user, 'Standard', 'Save Standard for this project');

    expect(await screen.findByText('Saved as version 6.')).toBeVisible();
    expect(sentTo(forge, 'PUT', `${API}/pipelines/standard`)[0]).toMatchObject({
      expected_version: 5,
      reason: SAVE_REASON,
    });

    expect(within(panel()).getByText('Changed from company default')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reset Standard' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('goes back to the company default');

    await user.type(within(dialog).getByLabelText('Reason for the reset'), 'use company');
    await user.click(within(dialog).getByRole('button', { name: 'Reset Standard' }));

    await waitFor(() =>
      expect(sentTo(forge, 'POST', `${API}/pipelines/standard/reset`)).toEqual([
        { expected_version: 6, reason: 'use company' },
      ]),
    );

    expect(await screen.findByText('Reset to the company default.')).toBeVisible();
    expect(within(panel()).getByText('Same as company default')).toBeVisible();
    expect(await stageNames('Standard')).toHaveLength(5);
  });

  it('does not touch the company: a project save leaves the company lane built-in', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });

    await ready();
    await addStageOf(user, /^Agent/);
    await saveLane(user, 'Express', 'Save Express for this project');
    await screen.findByText(/Saved as version/);

    const company = await forge.api.pipelines.list({ kind: 'company' });

    expect(company.lanes.express.tags).toEqual(['builtin']);
    expect(company.lanes.express.definition.stages).toHaveLength(3);
  });
});
