/**
 * Pins: Forge settings, Pipelines: the three lanes with their shipped stages, the locks on merge
 * and G1, the built-in / edited tag, and saving a lane as a numbered version.
 *
 * Why: this screen decides how much process a ticket gets, so the failures that hurt are quiet
 * ones: a lane that looks edited when it is not, a save that names the wrong version, a lane
 * switch that drops an unsaved list. Each is pinned here over the stubbed Forge server, which
 * versions and refuses like the server does.
 * Depends on: routes/settings/pipelines-page, the stubbed Forge server, renderApp, pipeline-screens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { refusal } from '#tests/helpers/fetch-stub.js';
import {
  PIPELINE_PATH,
  addStageOf,
  openLane,
  saveLane,
  sentTo,
  stageNames,
} from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { SAVE_REASON } from '#tests/helpers/pipeline-lists.js';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Pipelines', level: 1 });
  await screen.findByRole('tablist', { name: 'Lane' });
}

describe('company pipelines: the lanes', () => {
  it('lists the shipped stages of each lane and tags them built-in', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();

    expect(await stageNames('Express')).toEqual(['Implement', 'Gate G1', 'Merge']);
    expect(within(screen.getByRole('tabpanel')).getByText('Built-in')).toBeVisible();

    await openLane(user, 'Standard');

    expect(await stageNames('Standard')).toEqual([
      'Write failing tests',
      'Implement',
      'Gate G1',
      'Review',
      'Merge',
    ]);

    await openLane(user, 'Full');

    expect(await stageNames('Full')).toEqual([
      'Write failing tests',
      'Implement',
      'Gate G1',
      'Review and critique',
      'Your sign-off',
      'Merge',
    ]);
  });

  it('says Full cannot run yet and Express and Standard say nothing of the kind', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();

    const panel = (): HTMLElement => screen.getByRole('tabpanel');

    expect(within(panel()).queryByText(/Runs from the next update/)).toBeNull();

    await openLane(user, 'Standard');

    expect(within(panel()).queryByText(/Runs from the next update/)).toBeNull();

    await openLane(user, 'Full');

    expect(
      within(panel()).getByText(
        'Runs from the next update; Full tickets wait until then. You can edit it now.',
      ),
    ).toBeVisible();
  });

  it('locks merge and pins G1: a lock and the reason, and no buttons to move or remove them', async () => {
    renderApp({ path: PIPELINE_PATH });
    await ready();

    expect(screen.queryByRole('button', { name: 'Move Merge up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Merge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Gate G1' })).toBeNull();
    expect(
      screen.getByRole('img', {
        name: 'Merge is always the last stage and cannot be removed.',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('img', {
        name: 'The independent gate G1 is required after the last writer, so it stays in place.',
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Remove Implement' })).toBeEnabled();
  });

  it('follows the lane in the URL', async () => {
    renderApp({ path: `${PIPELINE_PATH}?lane=standard` });

    expect(await screen.findByRole('tab', { name: 'Standard' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    expect(await stageNames('Standard')).toHaveLength(5);
  });
});

describe('company pipelines: saving', () => {
  it('saves an edited lane as the next version, tags it edited and reports it', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await openLane(user, 'Standard');
    await user.click(await screen.findByRole('button', { name: 'Remove Review' }));

    expect(screen.queryByRole('button', { name: 'Save Standard' })).toBeDisabled();

    await saveLane(user, 'Standard');

    const [body] = sentTo(forge, 'PUT', '/settings/pipelines/standard') as {
      pipeline: { stages: { id: string }[] };
      expected_version: number;
      reason: string;
    }[];

    expect(body?.expected_version).toBe(3);
    expect(body?.reason).toBe(SAVE_REASON);
    expect(body?.pipeline.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'merge',
    ]);

    expect(await screen.findByText('Saved as version 4.')).toBeVisible();
    expect(within(screen.getByRole('tabpanel')).getByText('Edited')).toBeVisible();
    expect(await stageNames('Standard')).toHaveLength(4);
  });

  it('holds Save until there is a change and a reason, and says why', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();

    expect(screen.queryByRole('button', { name: 'Save Express' })).toBeNull();

    await addStageOf(user, /^Agent/);

    expect(screen.getByRole('button', { name: 'Save Express' })).toBeDisabled();
    expect(
      screen.getByText(/Say why you are changing this \(3 to 500 characters\)/),
    ).toBeVisible();

    await user.type(
      screen.getByLabelText('Reason for this change to the Express pipeline'),
      SAVE_REASON,
    );

    expect(screen.getByRole('button', { name: 'Save Express' })).toBeEnabled();
  });

  it('puts the saved list back with Discard changes', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Remove Implement' }));

    expect(await stageNames('Express')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(await stageNames('Express')).toEqual(['Implement', 'Gate G1', 'Merge']);
  });

  it('saves the lane that was edited and no other, and keeps an unsaved lane while looking at another', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Remove Implement' }));
    await openLane(user, 'Standard');

    expect(await stageNames('Standard')).toHaveLength(5);

    await openLane(user, 'Express');

    expect(await stageNames('Express')).toHaveLength(2);
  });

  it('says a refusal from the server in words and leaves the save bar usable', async () => {
    const user = userEvent.setup();

    renderApp({
      path: PIPELINE_PATH,
      routes: {
        'PUT /settings/pipelines/:lane': () => refusal(400, 'invalid_request', 'raw'),
      },
    });

    await ready();
    await addStageOf(user, /^Agent/);
    await saveLane(user, 'Express');

    expect(await screen.findByText(/Forge did not accept this\./)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save Express' })).toBeEnabled();
  });
});
