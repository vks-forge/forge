/**
 * Pins: Forge settings, Pipelines: a save refused for a stale version, leaving with unsaved
 * edits, Reset of an edited lane, and every state of the screen (loading, empty, error).
 *
 * Why: a stale save that overwrites a colleague's lane, a Reset that does nothing or says nothing
 * when there is nothing to reset, and a screen that is blank when the roster cannot be read are
 * the failures an owner cannot see coming. Each is pinned here over the stubbed Forge server.
 * Depends on: routes/settings/pipelines-page, the stubbed Forge server, renderApp, pipeline-screens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import {
  PIPELINE_PATH,
  addStageOf,
  saveLane,
  sentTo,
  stageNames,
} from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { lane } from '#tests/helpers/pipeline-lists.js';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Pipelines', level: 1 });
  await screen.findByRole('tablist', { name: 'Lane' });
}

describe('company pipelines: conflicts and leaving', () => {
  it('pauses on a stale version, then reloads the latest and drops the edits on request', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await addStageOf(user, /^Agent/);

    // A colleague saves the same lane first.
    await forge.api.pipelines.save({ kind: 'company' }, 'express', {
      pipeline: { ...lane('express'), description: 'from a colleague' },
      expected_version: 3,
      reason: 'colleague',
    });

    await saveLane(user, 'Express');

    const banner = (
      await screen.findByText(/The Express pipeline changed since you opened it/)
    ).closest('[role="alert"]') as HTMLElement;

    expect(banner).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Express' })).toBeDisabled();

    await user.click(
      within(banner).getByRole('button', { name: 'Reload latest and discard my edits' }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/changed since you opened it/)).toBeNull(),
    );

    expect(await stageNames('Express')).toEqual(['Implement', 'Gate G1', 'Merge']);
    expect(within(screen.getByRole('tabpanel')).getByText('Edited')).toBeVisible();
  });

  it('keeps my edits on the latest version when asked, then saves them over it', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await addStageOf(user, /^Agent/);

    // A colleague saves another lane: the version moves, this lane does not.
    await forge.api.pipelines.save({ kind: 'company' }, 'standard', {
      pipeline: { ...lane('standard'), description: 'other lane' },
      expected_version: 3,
      reason: 'colleague',
    });

    await saveLane(user, 'Express');
    await user.click(
      await screen.findByRole('button', { name: 'Keep my edits on the latest' }),
    );

    await user.click(screen.getByRole('button', { name: 'Save Express' }));

    expect(await screen.findByText('Saved as version 5.')).toBeVisible();

    const puts = sentTo(forge, 'PUT', '/settings/pipelines/express') as {
      expected_version: number;
    }[];

    expect(puts.map((p) => p.expected_version)).toEqual([3, 4]);
  });

  it('asks before leaving with unsaved edits', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await user.click(await screen.findByRole('button', { name: 'Remove Implement' }));
    void router.navigate('/settings/limits');

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
  });
});

describe('company pipelines: Reset', () => {
  it('is held on a built-in lane, with the reason', async () => {
    renderApp({ path: PIPELINE_PATH });
    await ready();

    expect(screen.getByRole('button', { name: 'Reset Express' })).toBeDisabled();
  });

  it('asks for a reason, resets the lane to the built-in list and says so', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await addStageOf(user, /^Agent/);
    await saveLane(user, 'Express');
    expect(await within(screen.getByRole('tabpanel')).findByText('Edited')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reset Express' }));

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reset Express' });

    expect(confirm).toBeDisabled();
    expect(dialog).toHaveTextContent(
      /Tickets already started keep the pipeline they began with/,
    );

    await user.type(
      within(dialog).getByLabelText('Reason for the reset'),
      'back to normal',
    );

    await user.click(confirm);

    await waitFor(() =>
      expect(sentTo(forge, 'POST', '/settings/pipelines/express/reset')).toEqual([
        { expected_version: 4, reason: 'back to normal' },
      ]),
    );

    expect(await screen.findByText('Reset to the built-in pipeline.')).toBeVisible();
    expect(within(screen.getByRole('tabpanel')).getByText('Built-in')).toBeVisible();
    expect(await stageNames('Express')).toEqual(['Implement', 'Gate G1', 'Merge']);
  });

  it('explains a reset the server says has nothing to reset', async () => {
    const user = userEvent.setup();

    renderApp({
      path: PIPELINE_PATH,
      routes: {
        'POST /settings/pipelines/:lane/reset': () =>
          refusal(409, 'not_overridden', 'raw'),
      },
    });

    await ready();
    await addStageOf(user, /^Agent/);
    await saveLane(user, 'Express');
    await within(screen.getByRole('tabpanel')).findByText('Edited');
    await user.click(screen.getByRole('button', { name: 'Reset Express' }));

    const dialog = await screen.findByRole('alertdialog');

    await user.type(within(dialog).getByLabelText('Reason for the reset'), 'oops');
    await user.click(within(dialog).getByRole('button', { name: 'Reset Express' }));

    expect(await screen.findByText('Nothing to reset')).toBeVisible();
  });
});

describe('company pipelines: every state', () => {
  it('shows loading first, then the lanes', async () => {
    renderApp({ path: PIPELINE_PATH });

    expect(screen.getByRole('status', { name: 'Loading pipelines' })).toBeInTheDocument();
    await ready();
  });

  it('says Forge cannot be reached and offers a retry', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH, scenario: 'error' });

    expect(await screen.findByText('Cannot reach Forge')).toBeVisible();
    expect(screen.getByRole('button', { name: /Try again|Retry/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Try again|Retry/ }));
  });

  it('points to Agents when there is no agent to build a stage from', async () => {
    renderApp({
      path: PIPELINE_PATH,
      routes: { 'GET /settings/agents': () => json({ agents: [], version: 3 }) },
    });

    expect(
      await screen.findByText('There are no agents to build a pipeline from'),
    ).toBeVisible();

    expect(screen.getByRole('link', { name: 'Open Agents' })).toHaveAttribute(
      'href',
      '/settings/agents',
    );
  });
});
