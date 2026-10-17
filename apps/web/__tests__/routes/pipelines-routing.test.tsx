/**
 * Pins: a project's routing rules: add, fill in, reorder, remove and save, an agent picker that
 * offers checks only, the problems a refused save carries, and a conflict that pauses instead of
 * overwriting.
 *
 * Why: the owner has to trust that a routing rule can only ever add a check (d-0069), never a
 * writer. A rule that saves with no path, or a conflict that overwrites a colleague's rules,
 * would quietly change what gets reviewed.
 * Depends on: routes/project-settings/pipelines-section, the stubbed Forge server, renderApp.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import { pipelineRoutes } from '#tests/helpers/fake-forge/pipeline-routes.js';
import { refusal } from '#tests/helpers/fetch-stub.js';
import { sentTo } from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';

const PATH = '/p/sample-service/settings/pipelines';
const API = '/settings/projects/sample-service';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Pipelines for this project', level: 2 });
  await screen.findByRole('tablist', { name: 'Lane' });
}

describe('project pipelines: routing rules', () => {
  it('starts empty, adds a rule from paths and a check, and saves it', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });

    await ready();

    expect(await screen.findByText('No routing rules yet')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add rule' }));

    const rule = await screen.findByRole('listitem', { name: 'Rule 1' });

    expect(within(rule).getByText('Add at least one path.')).toBeVisible();

    await user.type(within(rule).getByLabelText('Paths for Rule 1'), '**/*.tf');
    await user.click(
      within(rule).getByRole('button', { name: 'Add to Paths for Rule 1' }),
    );

    await choose(user, 'Check to add for Rule 1', /Critic/);
    await user.type(
      screen.getByLabelText('Reason for this change to the routing rules'),
      'terraform rule',
    );

    await user.click(screen.getByRole('button', { name: 'Save routing rules' }));

    expect(await screen.findByText('Saved as version 6.')).toBeVisible();
    expect(sentTo(forge, 'PUT', `${API}/routing`)).toEqual([
      {
        rules: [{ id: 'rule', paths: ['**/*.tf'], add: 'critic' }],
        expected_version: 5,
        reason: 'terraform rule',
      },
    ]);
  });

  it('offers reviewers and researchers only: never a writer', async () => {
    const user = userEvent.setup();

    renderApp({ path: PATH });
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));
    await user.click(
      await screen.findByRole('combobox', { name: 'Check to add for Rule 1' }),
    );

    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent ?? '',
    );

    expect(options.some((o) => o.startsWith('Reviewer'))).toBe(true);
    expect(options.some((o) => o.startsWith('Critic'))).toBe(true);
    expect(options.some((o) => o.startsWith('Implementer'))).toBe(false);
    expect(options.some((o) => o.startsWith('Test writer'))).toBe(false);
  });

  it('reorders and removes rules, and saves the list that is left', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PATH,
      routes: pipelineRoutes({
        routing: {
          'sample-service': [
            { id: 'tf', paths: ['**/*.tf'], add: 'reviewer', label: 'Terraform' },
            { id: 'sql', paths: ['**/*.sql'], add: 'critic', label: 'Migrations' },
          ],
        },
      }),
    });

    await ready();

    const names = async (): Promise<(string | null)[]> =>
      Array.from(
        (await screen.findByRole('list', { name: 'Routing rules' })).children,
      ).map((li) => li.getAttribute('aria-label'));

    await waitFor(async () => expect(await names()).toEqual(['Terraform', 'Migrations']));

    await user.click(screen.getByRole('button', { name: 'Move Migrations up' }));

    expect(await names()).toEqual(['Migrations', 'Terraform']);

    await user.click(screen.getByRole('button', { name: 'Remove Terraform' }));
    await user.type(
      screen.getByLabelText('Reason for this change to the routing rules'),
      'drop',
    );

    await user.click(screen.getByRole('button', { name: 'Save routing rules' }));
    await screen.findByText(/Saved as version/);

    expect(
      (sentTo(forge, 'PUT', `${API}/routing`).at(-1) as { rules: { id: string }[] })
        .rules,
    ).toEqual([{ id: 'sql', paths: ['**/*.sql'], add: 'critic', label: 'Migrations' }]);
  });

  it('shows the problems a refused save carries beside the rule', async () => {
    const user = userEvent.setup();

    renderApp({
      path: PATH,
      routes: {
        'PUT /settings/projects/:slug/routing': () => ({
          status: 400,
          body: {
            error: {
              code: 'routing_invalid',
              message: 'raw',
              problems: [{ code: 'routing_writer', stage_id: 'rule', message: 'm' }],
            },
          },
        }),
      },
    });

    await ready();
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));

    const rule = await screen.findByRole('listitem', { name: 'Rule 1' });

    await user.type(within(rule).getByLabelText('Paths for Rule 1'), 'src/**');
    await user.click(
      within(rule).getByRole('button', { name: 'Add to Paths for Rule 1' }),
    );

    await user.type(
      screen.getByLabelText('Reason for this change to the routing rules'),
      'why',
    );

    await user.click(screen.getByRole('button', { name: 'Save routing rules' }));

    expect(
      await within(rule).findByText(
        'A rule can add a reviewer or a researcher, never a writer.',
      ),
    ).toBeVisible();

    expect(await screen.findByText(/These rules cannot be saved\./)).toBeVisible();
  });

  it('pauses on a conflict instead of overwriting a colleague’s rules', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PATH });

    await ready();
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));

    const rule = await screen.findByRole('listitem', { name: 'Rule 1' });

    await user.type(within(rule).getByLabelText('Paths for Rule 1'), 'src/**');
    await user.click(
      within(rule).getByRole('button', { name: 'Add to Paths for Rule 1' }),
    );

    await forge.api.pipelines.saveRouting('sample-service', {
      rules: [{ id: 'theirs', paths: ['docs/**'], add: 'reviewer' }],
      expected_version: 5,
      reason: 'colleague',
    });

    await user.type(
      screen.getByLabelText('Reason for this change to the routing rules'),
      'mine',
    );

    await user.click(screen.getByRole('button', { name: 'Save routing rules' }));

    expect(
      await screen.findByText(/The routing rules changed since you opened it/),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Save routing rules' })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Reload latest and discard my edits' }),
    );

    expect(await screen.findByRole('listitem', { name: 'Rule 1' })).toBeVisible();
    expect(screen.queryByText(/changed since you opened it/)).toBeNull();
  });

  it('explains a project that is gone', async () => {
    const user = userEvent.setup();

    renderApp({
      path: PATH,
      routes: {
        'PUT /settings/projects/:slug/routing': () =>
          refusal(404, 'project_not_found', 'raw'),
      },
    });

    await ready();
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));

    const rule = await screen.findByRole('listitem', { name: 'Rule 1' });

    await user.type(within(rule).getByLabelText('Paths for Rule 1'), 'src/**');
    await user.click(
      within(rule).getByRole('button', { name: 'Add to Paths for Rule 1' }),
    );

    await user.type(
      screen.getByLabelText('Reason for this change to the routing rules'),
      'why',
    );

    await user.click(screen.getByRole('button', { name: 'Save routing rules' }));

    expect(await screen.findByText(/This project is gone\./)).toBeVisible();
  });
});
