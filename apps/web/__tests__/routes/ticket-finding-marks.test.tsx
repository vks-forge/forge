/**
 * Pins: on the Review tab the owner marks each finding "Real" or "False alarm", can clear the mark
 * by pressing it again, sees it change at once, and sees it put back with a plain sentence if the
 * server refuses; the mark names the finding by its position in the check's own list, not its place
 * in the severity-sorted display.
 *
 * Why: the owner is the final judge of a check, and the scorecards weigh that verdict above any
 * guess. A toggle that waits for the server feels broken, one that marks the wrong finding poisons
 * the record, and one that fails silently leaves the owner believing a verdict was kept.
 * Depends on: routes/ticket/review-findings, helpers/escalation-world, components/ticket/{finding-mark,findings-list},
 * api/use-finding-marks, the stubbed Forge server.
 */

import type { Finding } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { escalationWorld } from '#tests/helpers/escalation-world.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { decisionView } from '#tests/helpers/finished-work-views.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import {
  STANDARD_STAGES,
  stageView,
  ticketPipeline,
} from '#tests/helpers/forge-data/pipeline-data.js';
import { openNeedsYou } from '#tests/helpers/needs-you-modal.js';
import { renderApp } from '#tests/helpers/render-app.js';

const REVIEW = '/p/sample-service/tickets/SVC-4/review';
const PIPELINE = 'GET /tickets/SVC-4/pipeline';
const MARK = 'PUT /tickets/:id/findings/:row/:index/mark';

const LOW: Finding = {
  severity: 'low',
  file: 'src/a.ts',
  line: 1,
  issue: 'A name is unclear.',
  evidence: 'The helper is called x.',
};

const HIGH: Finding = {
  severity: 'high',
  file: 'src/b.ts',
  line: 9,
  issue: 'The loop never ends.',
  evidence: 'There is no exit on line 9.',
};

/** The low finding is first in the check's list (index 0) but is shown after the high one. */
function pipeline(marks: { index: number; verdict: 'real' | 'false_alarm' }[] = []) {
  return ticketPipeline(
    STANDARD_STAGES.map((s) =>
      s.id === 'reviewer'
        ? stageView('reviewer', {
            label: 'Review',
            status: 'failed',
            row_id: 7,
            counts: { critical: 0, high: 1, medium: 0, low: 1 },
            findings: [LOW, HIGH],
            ...(marks.length > 0 ? { marks } : {}),
          })
        : s,
    ),
  );
}

/** SVC-4 waits on the owner for a review, so its Review tab exists. */
function open(routes: Routes = {}) {
  const world = escalationWorld([decisionView('findings_hold')], {
    ticketStatus: { 'SVC-4': 'waiting_human' },
  });

  return renderApp({
    path: REVIEW,
    routes: {
      ...world.routes,
      [PIPELINE]: json({ pipeline: pipeline() }),
      ...routes,
    },
  });
}

async function highGroup(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: 'Is finding 2 real?' });
}

describe('Review tab: finding marks', () => {
  it('names the finding by its position in the check, not in the sorted list', async () => {
    const user = userEvent.setup();
    const { forge } = open({
      [MARK]: ({ body }) =>
        json({
          pipeline: pipeline([
            { index: 1, verdict: (body as { verdict: 'real' }).verdict },
          ]),
        }),
    });

    const high = await highGroup();

    await user.click(within(high).getByRole('button', { name: 'Real' }));

    await waitFor(() => {
      const call = forge.stub.callsTo(MARK)[0];

      expect(call?.path).toBe('/tickets/SVC-4/findings/7/1/mark');
      expect(call?.body).toEqual({ verdict: 'real' });
    });
  });

  it('shows the mark at once, before the server answers', async () => {
    const user = userEvent.setup();
    open({
      [MARK]: {
        delayMs: 400,
        body: { pipeline: pipeline([{ index: 1, verdict: 'false_alarm' }]) },
      },
    });

    const group = await highGroup();

    await user.click(within(group).getByRole('button', { name: 'False alarm' }));

    expect(within(group).getByRole('button', { name: 'False alarm' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(within(group).getByRole('button', { name: 'Real' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clears the mark when the pressed button is pressed again', async () => {
    const user = userEvent.setup();
    // The server keeps the mark until the clear lands, so the refetch after it must not bring it back.
    let marks: { index: number; verdict: 'real' | 'false_alarm' }[] = [
      { index: 1, verdict: 'real' },
    ];

    const { forge } = open({
      [PIPELINE]: () => json({ pipeline: pipeline(marks) }),
      [MARK]: () => {
        marks = [];

        return json({ pipeline: pipeline(marks) });
      },
    });

    const group = await highGroup();

    expect(within(group).getByRole('button', { name: 'Real' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(group).getByRole('button', { name: 'Real' }));

    await waitFor(() =>
      expect(forge.stub.callsTo(MARK)[0]?.body).toEqual({ verdict: null }),
    );

    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Real' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  it('puts the mark back and says so when the server refuses', async () => {
    const user = userEvent.setup();
    open({ [MARK]: () => refusal(404, 'finding_not_found', 'That finding is gone.') });

    const group = await highGroup();

    await user.click(within(group).getByRole('button', { name: 'Real' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your verdict was not saved.',
    );

    expect(within(group).getByRole('button', { name: 'Real' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is reachable and operable with the keyboard', async () => {
    const user = userEvent.setup();
    const { forge } = open({ [MARK]: () => json({ pipeline: pipeline() }) });

    const group = await highGroup();
    const real = within(group).getByRole('button', { name: 'Real' });

    real.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(forge.stub.callsTo(MARK)).toHaveLength(1));
  });

  it('offers the toggle in the stage detail too, and not on the held-decision card', async () => {
    const user = userEvent.setup();
    open();

    await highGroup();
    const dock = await openNeedsYou(user);
    const card = await within(dock).findByRole('region', { name: /Held: Critique/ });

    expect(within(card).queryByRole('group', { name: /^Is finding/ })).toBeNull();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: /^Review/ }));
    const detail = await screen.findByRole('region', { name: 'Details of Review' });

    expect(within(detail).getAllByRole('group', { name: /^Is finding/ })).toHaveLength(2);
  });
});
