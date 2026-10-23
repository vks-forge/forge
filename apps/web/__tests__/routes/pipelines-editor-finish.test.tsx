/**
 * Pins: adding the Director check and the sign-off in the pipeline editor: one of each, a refusal
 * with its reason when one is already there, the sign-off placed last before merge with who signs
 * and what to ask editable, and the Director check placed after the gate with what a blocking
 * finding does (hold for the owner by default) stored only when it differs.
 *
 * Why: these two stages decide who puts a name on the work. A second one that saves, a Director
 * check that silently sends work back instead of holding it, or a sign-off whose "who signs" is
 * stored wrongly would change who may merge without the owner seeing it.
 * Depends on: routes/settings/pipelines-page, the stubbed Forge server, renderApp, pipeline-screens.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  PIPELINE_PATH,
  addStageOf,
  openDetails,
  saveLane,
  sentTo,
  stageNames,
  stageRow,
} from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';

type Sent = { pipeline: { stages: Record<string, unknown>[] } };

async function ready(): Promise<void> {
  await screen.findByRole('tablist', { name: 'Lane' });
}

const lastPut = (forge: Parameters<typeof sentTo>[0], laneName: string): Sent =>
  sentTo(forge, 'PUT', `/settings/pipelines/${laneName}`).at(-1) as Sent;

describe('Director check and sign-off', () => {
  it('offers one sign-off and one Director check, and says so when they are already there', async () => {
    const user = userEvent.setup();

    renderApp({ path: `${PIPELINE_PATH}?lane=full` });
    await ready();
    await user.click(await screen.findByRole('button', { name: 'Add stage' }));

    const signOff = await screen.findByRole('menuitem', { name: /^Sign-off/ });
    const check = await screen.findByRole('menuitem', { name: /^Director check/ });

    expect(signOff).toHaveAttribute('aria-disabled', 'true');
    expect(signOff).toHaveTextContent('A pipeline has at most one sign-off.');
    expect(check).toHaveAttribute('aria-disabled', 'true');
    expect(check).toHaveTextContent('A pipeline has at most one Director check.');
  });

  it('adds the sign-off last before merge and lets the owner choose who signs and word the question', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await addStageOf(user, /^Sign-off/);

    expect((await stageNames('Express')).slice(-2)).toEqual(['Sign-off', 'Merge']);
    expect(await stageRow('Express', 'Sign-off')).toHaveTextContent(
      'Director signs when every check passed, otherwise you',
    );

    await openDetails(user, 'Sign-off');

    await user.click(screen.getByRole('button', { name: 'Always me' }));

    expect(await stageRow('Express', 'Sign-off')).toHaveTextContent('Always you');

    const prompt = screen.getByLabelText('What to ask you');

    await user.clear(prompt);
    await user.type(prompt, 'Check the migration by eye');
    await saveLane(user, 'Express');
    await screen.findByText(/Saved as version/);

    expect(lastPut(forge, 'express').pipeline.stages.at(-2)).toMatchObject({
      kind: 'sign_off',
      signer: 'owner',
      prompt: 'Check the migration by eye',
    });
  });

  it('adds a Director check after the gate whose blocking findings hold for the owner by default', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await addStageOf(user, /^Director check/);

    expect((await stageNames('Express')).slice(-2)).toEqual([
      'Check against the plan',
      'Merge',
    ]);

    await openDetails(user, 'Check against the plan');

    expect(screen.getByRole('button', { name: 'Hold for me' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /^Send back/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Medium' }));
    await saveLane(user, 'Express');
    await screen.findByText(/Saved as version/);

    expect(lastPut(forge, 'express').pipeline.stages.at(-2)).toMatchObject({
      kind: 'director_check',
      on_blocking: 'rework',
      blocking: ['critical', 'high', 'medium'],
    });
  });
});
