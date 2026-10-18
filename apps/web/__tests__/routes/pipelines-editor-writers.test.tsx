/**
 * Pins: a group of writers in the pipeline editor: it is told apart from a group of checks, each
 * member shows the folders its agent may write, overlapping folders are refused in plain words
 * with Save held, a script check cannot join writers, the group keeps two to four members, and a
 * critic on the Worker's own model family is noted on its row.
 *
 * Why: two writers share one worktree, so the one thing standing between them and a clobbered file
 * is that their folders never meet. An owner who adds a writer group must see whose folders are
 * whose, and must be stopped, with the reason, before saving a pair that could overwrite each
 * other; a critic that shares the Worker's model is the one case the owner may want to know about
 * and still allow.
 * Depends on: routes/settings/pipelines-page, components/pipelines/group-members, the stubbed Forge
 * server, renderApp, pipeline-screens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PROBLEM_WORDS } from '#/domain/pipeline-copy.js';
import { pipelineRoutes } from '#tests/helpers/fake-forge/pipeline-routes.js';
import { json } from '#tests/helpers/fetch-stub.js';
import {
  PIPELINE_PATH,
  addStageOf,
  openDetails,
  openLane,
  stageRow,
} from '#tests/helpers/pipeline-screens.js';
import { ROSTER } from '#tests/helpers/pipeline-lists.js';
import { renderApp } from '#tests/helpers/render-app.js';

async function ready(): Promise<void> {
  await screen.findByRole('tablist', { name: 'Lane' });
}

/** The shipped roster with the write scopes of two writers set, so their folders can be told apart. */
const SPLIT = ROSTER.map((agent) =>
  agent.id === 'implementer'
    ? { ...agent, definition: { ...agent.definition, write_scope: ['apps/web/**'] } }
    : agent.id === 'test-writer'
      ? { ...agent, definition: { ...agent.definition, write_scope: ['packages/**'] } }
      : agent,
);

function render(roster = ROSTER, families?: readonly string[]) {
  return renderApp({
    path: PIPELINE_PATH,
    routes: {
      ...pipelineRoutes({ roster, ...(families ? { families } : {}) }),
      'GET /settings/agents': () => json({ agents: roster, version: 3 }),
    },
  });
}

describe('a group of writers', () => {
  it('is added before G1 and told apart from a group of checks', async () => {
    const user = userEvent.setup();

    render(SPLIT);
    await ready();
    await addStageOf(user, /^Writers together/);

    const row = await stageRow('Express', 'Writers together');

    expect(row).toHaveTextContent('Run together');
    await openDetails(user, 'Writers together');

    expect(
      screen.getByText(/These writers work at the same time in one worktree/),
    ).toBeVisible();

    expect(screen.getByRole('button', { name: 'Add a writer' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add a script check' })).toBeNull();
    expect(screen.queryByText('When this check finds a problem')).toBeNull();
  });

  it('shows each member the folders its agent may write', async () => {
    const user = userEvent.setup();

    render(SPLIT);
    await ready();
    await addStageOf(user, /^Writers together/);
    await openDetails(user, 'Writers together');

    const members = screen.getByRole('list', { name: 'Writers in Writers together' });

    expect(within(members).getByText('apps/web/**')).toBeVisible();
    expect(within(members).getByText('packages/**')).toBeVisible();
  });

  it('accepts writers whose folders cannot meet', async () => {
    const user = userEvent.setup();

    render(SPLIT);
    await ready();
    await addStageOf(user, /^Writers together/);

    expect(screen.queryByText(PROBLEM_WORDS.writer_scope_overlap)).toBeNull();
  });

  it('refuses writers whose folders overlap, in words beside the group, and holds Save', async () => {
    const user = userEvent.setup();

    // The shipped implementer may write anywhere, so it meets every other writer.
    render(ROSTER);
    await ready();
    await addStageOf(user, /^Writers together/);

    const row = await stageRow('Express', 'Writers together');

    expect(within(row).getByRole('alert')).toHaveTextContent(
      PROBLEM_WORDS.writer_scope_overlap,
    );

    expect(screen.getByRole('button', { name: 'Save Express' })).toBeDisabled();
    expect(screen.getByText(/Fix the problems listed above before saving/)).toBeVisible();
  });

  it('says a writer with no folders set may write anywhere', async () => {
    const user = userEvent.setup();

    render(ROSTER);
    await ready();
    await addStageOf(user, /^Writers together/);
    await openDetails(user, 'Writers together');

    expect(
      screen.getAllByText(/anywhere \(no folders set for this agent\)|\*\*/).length,
    ).toBeGreaterThan(0);
  });

  it('keeps two to four members, each refusal with its reason', async () => {
    const user = userEvent.setup();

    render(SPLIT);
    await ready();
    await addStageOf(user, /^Writers together/);
    await openDetails(user, 'Writers together');

    const remove = screen.getAllByRole('button', { name: /^Remove .* from the group$/ });

    expect(remove).toHaveLength(2);
    expect(remove[0]).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add a writer' }));
    await user.click(screen.getByRole('button', { name: 'Add a writer' }));

    expect(screen.getByRole('button', { name: 'Add a writer' })).toBeDisabled();
    expect(screen.getByText('A group holds at most 4 writers.')).toBeVisible();
  });
});

describe('a critic on the Worker’s own model family', () => {
  it('is noted on the group row, not only in a list above', async () => {
    const user = userEvent.setup();

    render(ROSTER);
    await ready();
    await openLane(user, 'Full');

    const row = await stageRow('Full', 'Review and critique');

    expect(within(row).getByRole('note')).toHaveTextContent(/same|family/i);
  });
});
