/**
 * Pins: the pipeline editor's agents and judgement: the check policy stored as differences, the
 * red proof, the agent picker's unavailable agents, live problems beside the row, the server's
 * verdict (the validate call and a refused save) and a plain sentence for every problem code.
 *
 * Why: a policy stored with its defaults spelled out makes an untouched lane look edited; an
 * agent that looks usable and is not fails a ticket at dispatch; a problem that shows only after
 * Save, or as a code, sends the owner hunting.
 * Depends on: routes/settings/pipelines-page, the stubbed Forge server, renderApp, pipeline-screens.
 */

import { PIPELINE_PROBLEM_CODES } from '@forge/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PipelineEditor } from '#/components/pipelines/pipeline-editor.js';
import { TooltipProvider } from '#/components/ui/tooltip.js';
import { PROBLEM_WORDS } from '#/domain/pipeline-copy.js';
import { pipelineRoutes } from '#tests/helpers/fake-forge/pipeline-routes.js';
import { choose } from '#tests/helpers/choose.js';
import { json } from '#tests/helpers/fetch-stub.js';
import {
  PIPELINE_PATH,
  addStageOf,
  openDetails,
  openLane,
  saveLane,
  sentTo,
  stageRow,
} from '#tests/helpers/pipeline-screens.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { ROSTER, SAVE_REASON, lane, withTag } from '#tests/helpers/pipeline-lists.js';

type Sent = { pipeline: { stages: Record<string, unknown>[] } };

async function ready(): Promise<void> {
  await screen.findByRole('tablist', { name: 'Lane' });
}

const lastPut = (forge: Parameters<typeof sentTo>[0], laneName: string): Sent =>
  sentTo(forge, 'PUT', `/settings/pipelines/${laneName}`).at(-1) as Sent;

describe('agent, red proof and check policy', () => {
  it('stores a policy change only as the difference from the defaults', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await openLane(user, 'Standard');
    await openDetails(user, 'Review');

    const hold = screen.getByRole('button', { name: 'Hold for me' });

    expect(
      screen.getByRole('button', { name: 'Send back (up to 2 times)' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(hold);
    await user.click(screen.getByRole('checkbox', { name: 'Medium' }));
    await choose(user, /Send back to/, 'Write failing tests');
    await saveLane(user, 'Standard');
    await screen.findByText(/Saved as version/);

    expect(lastPut(forge, 'standard').pipeline.stages[3]).toEqual({
      id: 'reviewer',
      kind: 'agent',
      label: 'Review',
      agent: 'reviewer',
      on_blocking: 'hold',
      blocking: ['critical', 'high', 'medium'],
      rework_to: 'test-writer',
    });
  });

  it('turns the red proof of a test writer off and takes it out of the list', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: PIPELINE_PATH });

    await ready();
    await openLane(user, 'Standard');
    await openDetails(user, 'Write failing tests');

    const proof = screen.getByRole('switch', {
      name: 'Red proof for Write failing tests',
    });

    expect(proof).toHaveAttribute('aria-checked', 'true');

    await user.click(proof);
    await saveLane(user, 'Standard');
    await screen.findByText(/Saved as version/);

    expect(lastPut(forge, 'standard').pipeline.stages[0]).not.toHaveProperty('proof');
  });

  it('shows a switched-off agent in the picker, greyed, with the reason', async () => {
    const user = userEvent.setup();
    const roster = withTag('critic', 'disabled');

    renderApp({
      path: PIPELINE_PATH,
      routes: {
        ...pipelineRoutes({ roster }),
        'GET /settings/agents': () => json({ agents: roster, version: 3 }),
      },
    });

    await ready();
    await openLane(user, 'Standard');
    await openDetails(user, 'Review');
    await user.click(await screen.findByRole('combobox', { name: 'Agent for Review' }));

    const option = await screen.findByRole('option', { name: /Critic/ });

    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent(
      'Switched off for this scope. Switch it on under Agents.',
    );
  });

  it('files the problem of a changed agent under its own row and holds Save', async () => {
    const user = userEvent.setup();

    renderApp({ path: PIPELINE_PATH });
    await ready();
    await openLane(user, 'Standard');
    await openDetails(user, 'Review');
    await choose(user, 'Agent for Review', /Implementer/);

    const row = await stageRow('Standard', 'Review');

    expect(within(row).getAllByRole('alert').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Fix the problems listed above before saving.'),
    ).toBeVisible();
  });
});

describe('the server judges the list too', () => {
  it('shows what the validate call finds beside the row, and its warnings, and holds Save', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: PIPELINE_PATH,
      routes: {
        'POST /settings/pipelines/validate': () =>
          json({
            problems: [
              { code: 'review_tool_missing', stage_id: 'implementer', message: 'server' },
            ],
            warnings: ['Critique: runs on the same model family as the writer.'],
          }),
      },
    });

    await ready();
    await addStageOf(user, /^Agent/);

    const row = await stageRow('Express', 'Implement');

    expect(await within(row).findByText(PROBLEM_WORDS.review_tool_missing)).toBeVisible();
    const panel = screen.getByRole('tabpanel');

    expect(within(panel).getByText('Worth a second look')).toBeVisible();
    expect(
      within(panel).getByText('Critique: runs on the same model family as the writer.'),
    ).toBeVisible();

    await user.type(
      screen.getByLabelText('Reason for this change to the Express pipeline'),
      SAVE_REASON,
    );

    expect(screen.getByRole('button', { name: 'Save Express' })).toBeDisabled();
    expect(sentTo(forge, 'POST', '/settings/pipelines/validate')[0]).toMatchObject({
      lane: 'express',
    });
  });

  it('shows the problems a refused save carries, beside their rows, and nothing is saved', async () => {
    const user = userEvent.setup();

    renderApp({
      path: PIPELINE_PATH,
      routes: {
        'PUT /settings/pipelines/:lane': () => ({
          status: 400,
          body: {
            error: {
              code: 'pipeline_invalid',
              message: 'raw',
              problems: [{ code: 'self_review', stage_id: 'implementer', message: 'm' }],
            },
          },
        }),
      },
    });

    await ready();
    await addStageOf(user, /^Agent/);
    await saveLane(user, 'Express');

    const row = await stageRow('Express', 'Implement');

    expect(await within(row).findByText(PROBLEM_WORDS.self_review)).toBeVisible();
    expect(await screen.findByText(/This pipeline cannot be saved\./)).toBeVisible();
  });
});

describe('every problem code reads as a sentence', () => {
  it('shows a plain sentence for each code, beside its row or above the list', () => {
    const def = lane('full');
    const ids = def.stages.map((s) => s.id);
    const problems = PIPELINE_PROBLEM_CODES.map((code, at) => ({
      code,
      ...(at % 2 === 0 ? { stage_id: ids[at % ids.length] as string } : {}),
      message: `server text ${code}`,
    }));

    render(
      <TooltipProvider>
        <PipelineEditor
          label="Full"
          def={def}
          roster={ROSTER}
          problems={problems}
          warnings={[]}
          checking={false}
          onChange={() => undefined}
        />
      </TooltipProvider>,
    );

    for (const code of PIPELINE_PROBLEM_CODES) {
      expect(screen.getAllByText(PROBLEM_WORDS[code]).length).toBeGreaterThan(0);
    }

    expect(screen.queryByText(/server text/)).toBeNull();
  });
});
