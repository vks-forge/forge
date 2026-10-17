/**
 * Helpers for the pipeline screen tests: open a lane, read its stages, open a stage's details,
 * save with a reason, read what was sent.
 *
 * Why: every pipeline test starts by picking a lane and ends by typing a reason and pressing the
 * lane's save button, then checking exactly which body went to which path. Keeping those steps
 * here keeps each test about the behaviour it pins, and makes "what was sent" read the same
 * everywhere.
 *
 * Exports: openLane(), stageNames(), stageRow(), openDetails(), saveLane(), addStageOf(),
 *   sentTo(), PIPELINE_PATH.
 * Depends on: @testing-library/react, @testing-library/user-event, helpers/fake-forge.
 */

import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { FakeForge } from '#tests/helpers/fake-forge/fake-forge.js';
import { SAVE_REASON } from '#tests/helpers/pipeline-lists.js';

export const PIPELINE_PATH = '/settings/pipelines';

export async function openLane(user: UserEvent, name: string): Promise<void> {
  await user.click(await screen.findByRole('tab', { name }));
}

/** The stage names of the lane that is showing, in order. */
export async function stageNames(lane: string): Promise<(string | null)[]> {
  const list = await screen.findByRole('list', { name: `${lane} stages` });

  return Array.from(list.children).map((li) => li.getAttribute('aria-label'));
}

/** The row (list item) of stage `name` in the lane that is showing. */
export async function stageRow(lane: string, name: string): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: `${lane} stages` });

  return within(list).getByRole('listitem', { name });
}

/** Opens the Details of stage `name`. */
export async function openDetails(user: UserEvent, name: string): Promise<void> {
  await user.click(await screen.findByRole('button', { name: `Details for ${name}` }));
}

/** Types a reason and presses the lane's save button. */
export async function saveLane(
  user: UserEvent,
  lane: string,
  label: string | RegExp = `Save ${lane}`,
  reason = SAVE_REASON,
): Promise<void> {
  await user.type(
    await screen.findByLabelText(`Reason for this change to the ${lane} pipeline`),
    reason,
  );

  await user.click(screen.getByRole('button', { name: label }));
}

/** Opens the Add stage menu and picks the entry `item`. */
export async function addStageOf(user: UserEvent, item: string | RegExp): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Add stage' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

/** The bodies of every call to exactly `METHOD path`, oldest first. */
export function sentTo(forge: FakeForge, method: string, path: string): unknown[] {
  return forge.stub.calls
    .filter((c) => c.method === method && c.path === path)
    .map((c) => c.body);
}
