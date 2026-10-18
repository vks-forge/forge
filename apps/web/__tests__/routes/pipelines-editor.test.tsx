/**
 * Pins: the pipeline editor's stages: adding, moving and removing each kind, the details of a
 * script gate, a group and the human sign-off, and the keyboard path through them.
 *
 * Why: the editor is how an owner decides whether unreviewed work can merge. A list that saves
 * with a hole in it, a group outside its size, or a control a keyboard cannot reach would each
 * let the wrong pipeline through, or lock the owner out of making the right one.
 * Depends on: routes/settings/pipelines-page, the stubbed Forge server, renderApp, pipeline-screens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PROBLEM_WORDS } from '#/domain/pipeline-copy.js';
import {
  PIPELINE_PATH,
  addStageOf,
  openDetails,
  openLane,
  saveLane,
  sentTo,
  stageNames,
  stageRow,
} from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { SAVE_REASON } from '#tests/helpers/pipeline-lists.js';

type Sent = { pipeline: { stages: Record<string, unknown>[] } };

async function ready(): Promise<void> {
  await screen.findByRole('tablist', { name: 'Lane' });
}

const lastPut = (forge: Parameters<typeof sentTo>[0], laneName: string): Sent =>
  sentTo(forge, 'PUT', `/settings/pipelines/${laneName}`).at(-1) as Sent;

describe('adding and moving stages', () => {
  it('adds an agent check after G1, then moves it up and saves the new order', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await openLane(user, 'Standard');
    await addStageOf(user, /^Agent/);

    expect(await stageNames('Standard')).toEqual([
      'Write failing tests',
      'Implement',
      'Gate G1',
      'Review',
      'Reviewer',
      'Merge',
    ]);

    await user.click(screen.getByRole('button', { name: 'Move Reviewer up' }));
    await saveLane(user, 'Standard');
    await screen.findByText(/Saved as version/);

    expect(lastPut(forge, 'standard').pipeline.stages.map((s) => s['id'])).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer-2',
      'reviewer',
      'merge',
    ]);
  });

  it('explains why a control cannot act instead of doing nothing', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();
    await openLane(user, 'Standard');

    expect(
      screen.getByRole('button', { name: 'Move Write failing tests up' }),
    ).toBeDisabled();

    expect(screen.getByRole('button', { name: 'Move Review down' })).toBeDisabled();

    await user.hover(
      screen.getByRole('button', { name: 'Move Review down' }).parentElement!,
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Merge always stays last.',
    );
  });

  it('removes a stage and refuses a list with no writer, in words above the list', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Remove Implement' }));

    expect(await screen.findByText('This pipeline cannot be saved yet')).toBeVisible();
    expect(screen.getByText(PROBLEM_WORDS.no_writer)).toBeVisible();

    await user.type(
      screen.getByLabelText('Reason for this change to the Express pipeline'),
      SAVE_REASON,
    );

    expect(screen.getByRole('button', { name: 'Save Express' })).toBeDisabled();
    expect(
      screen.getByText('Fix the problems listed above before saving.'),
    ).toBeVisible();
  });
});

describe('script gate, group and human sign-off', () => {
  it('adds a script gate that cannot be saved until it has a command, then saves it with its guards', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await addStageOf(user, /^Script gate/);

    const row = await stageRow('Express', 'Script check');

    expect(within(row).getByText(PROBLEM_WORDS.script_invalid)).toBeVisible();

    await openDetails(user, 'Script check');
    await user.type(screen.getByLabelText('Command'), 'npm run lint');

    expect(within(row).queryByText(PROBLEM_WORDS.script_invalid)).toBeNull();

    const seconds = screen.getByLabelText('Time limit (seconds)');

    await user.clear(seconds);
    await user.type(seconds, '60');
    await user.type(screen.getByLabelText('Guarded paths'), 'scripts/**');
    await user.click(screen.getByRole('button', { name: 'Add to Guarded paths' }));
    await saveLane(user, 'Express');
    await screen.findByText(/Saved as version/);

    expect(lastPut(forge, 'express').pipeline.stages[2]).toMatchObject({
      kind: 'script_gate',
      run: { command: 'npm run lint', timeout_ms: 60_000, guard_paths: ['scripts/**'] },
    });
  });

  it('holds a group to two to four checks, each refusal with its reason', async () => {
    const user = userEvent.setup();

    renderApp({ path: `${PIPELINE_PATH}?lane=full` });
    await ready();
    await openDetails(user, 'Review and critique');

    const members = await screen.findByRole('list', {
      name: 'Checks in Review and critique',
    });

    expect(within(members).getAllByRole('listitem', { name: /./ })).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Remove Review from the group' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add an agent check' }));
    await user.click(screen.getByRole('button', { name: 'Add a script check' }));

    expect(screen.getByRole('button', { name: 'Add an agent check' })).toBeDisabled();
    expect(screen.getByText('A group holds at most 4 checks.')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: /^Remove .* from the group$/ })[0],
    ).toBeEnabled();
  });
});

describe('keyboard', () => {
  it('moves between lanes with the arrow keys and opens each', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();

    screen.getByRole('tab', { name: 'Express' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Standard' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Standard' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{End}');

    expect(screen.getByRole('tab', { name: 'Full' })).toHaveFocus();
  });

  it('adds a stage and reorders it without a mouse', async () => {
    const user = userEvent.setup();

    renderApp({ path: `${PIPELINE_PATH}?lane=standard` });
    await ready();
    await stageNames('Standard');

    screen.getByRole('button', { name: 'Add stage' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    await waitFor(async () => expect(await stageNames('Standard')).toHaveLength(6));

    screen.getByRole('button', { name: 'Move Reviewer up' }).focus();
    await user.keyboard('{Enter}');

    expect((await stageNames('Standard')).slice(2, 5)).toEqual([
      'Gate G1',
      'Reviewer',
      'Review',
    ]);
  });

  it('reaches every control of a row with Tab, in reading order', async () => {
    const user = userEvent.setup();

    renderApp({ path: `${PIPELINE_PATH}?lane=standard` });
    await ready();
    await stageNames('Standard');

    screen.getByRole('button', { name: 'Remove Write failing tests' }).focus();
    await user.tab();

    expect(
      screen.getByRole('button', { name: 'Details for Write failing tests' }),
    ).toHaveFocus();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Move Implement up' })).toHaveFocus();
  });
});
