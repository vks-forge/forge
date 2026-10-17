/**
 * Pins: a stage's detail on the ticket page: its findings by severity, its summary, its run link,
 * artifacts loaded only when opened (the Worker's own account labelled as such), a group's
 * members, and keyboard open and close.
 *
 * Why: the strip says a stage failed; the detail says why. A diff fetched before anyone asked
 * for it, a Worker's own account shown without saying a reviewer never saw it, or a detail a
 * keyboard cannot open would each hide the one thing that decides what the owner does next.
 * Depends on: routes/ticket/stage-detail, the stubbed Forge server.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal, sequence } from '#tests/helpers/fetch-stub.js';
import {
  STANDARD_STAGES,
  stageView,
  ticketPipeline,
} from '#tests/helpers/forge-data/pipeline-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-1';
const PIPELINE = 'GET /tickets/SVC-1/pipeline';

const stages = (over: Record<string, Parameters<typeof stageView>[1]>) =>
  STANDARD_STAGES.map((s) => (over[s.id] ? { ...s, ...over[s.id] } : s));

const chip = (label: string, status: RegExp | string): HTMLElement =>
  screen.getByRole('button', {
    name: new RegExp(
      `^${label}\\s*${typeof status === 'string' ? status : status.source}`,
    ),
  });

async function strip(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Pipeline stages' });
}

describe('pipeline strip: stage detail', () => {
  const failed = ticketPipeline(
    stages({
      g1: { status: 'passed' },
      reviewer: {
        status: 'failed',
        run_id: 'run-r1',
        started_at: '2026-10-17T10:00:00.000Z',
        summary: 'The retry loop never gives up.',
        counts: { critical: 0, high: 1, medium: 0, low: 2 },
        artifacts: [
          { id: 7, kind: 'diff' },
          { id: 8, kind: 'narrative' },
        ],
      },
    }),
    { rework: { count: 1, cap: 2 } },
  );

  const routes = {
    [PIPELINE]: json({ pipeline: failed }),
    'GET /tickets/SVC-1/artifacts/:artifactId': ({
      params,
    }: {
      params: Record<string, string>;
    }) =>
      json({
        id: Number(params['artifactId']),
        ticket_id: 'SVC-1',
        stage_run_id: 3,
        kind: params['artifactId'] === '7' ? 'diff' : 'narrative',
        content:
          params['artifactId'] === '7'
            ? '+ added line\n- removed line'
            : 'I think I did it.',
        truncated: params['artifactId'] === '8',
        sha256: 'b'.repeat(64),
        created_at: '2026-10-17T10:00:00.000Z',
      }),
  };

  it('shows the failed check with its findings by severity, its summary and a link to its run', async () => {
    const user = userEvent.setup();

    renderApp({ path: TICKET, routes });
    await strip();
    await user.click(chip('Review', 'Failed'));

    const detail = await screen.findByRole('region', { name: 'Details of Review' });

    expect(within(detail).getByText('1 high, 2 low')).toBeVisible();
    expect(within(detail).getByText('The retry loop never gives up.')).toBeVisible();
    expect(
      within(detail).getByRole('link', { name: 'Open the run of Review' }),
    ).toHaveAttribute('href', `${TICKET}/conversation?run=run-r1`);
  });

  it('loads an artifact only when it is opened, and labels the Worker’s own account', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: TICKET, routes });

    await strip();
    await user.click(chip('Review', 'Failed'));

    const detail = await screen.findByRole('region', { name: 'Details of Review' });

    expect(forge.stub.callsTo('GET /tickets/:id/artifacts/:artifactId')).toHaveLength(0);

    await user.click(within(detail).getByRole('button', { name: 'Show Diff' }));

    expect(await within(detail).findByLabelText('Diff')).toHaveTextContent(
      '+ added line',
    );

    expect(forge.stub.callsTo('GET /tickets/:id/artifacts/:artifactId')).toHaveLength(1);

    await user.click(
      within(detail).getByRole('button', { name: 'Show Worker’s own account' }),
    );

    expect(
      await within(detail).findByText(
        /Reviewers never see it, so their findings do not lean on it/,
      ),
    ).toBeVisible();

    expect(
      await within(detail).findByText(/rest was cut when it was stored/),
    ).toBeVisible();

    await user.click(within(detail).getByRole('button', { name: 'Hide Diff' }));

    expect(within(detail).queryByLabelText('Diff')).toBeNull();
  });

  it('says an artifact could not be loaded and offers to try again', async () => {
    const user = userEvent.setup();

    renderApp({
      path: TICKET,
      routes: {
        ...routes,
        'GET /tickets/SVC-1/artifacts/:artifactId': sequence(
          refusal(500, 'boom'),
          json({
            id: 7,
            ticket_id: 'SVC-1',
            stage_run_id: 3,
            kind: 'diff',
            content: 'second try',
            truncated: false,
            sha256: 'b'.repeat(64),
            created_at: '2026-10-17T10:00:00.000Z',
          }),
        ),
      },
    });

    await strip();
    await user.click(chip('Review', 'Failed'));
    await user.click(await screen.findByRole('button', { name: 'Show Diff' }));

    expect(await screen.findByText('Could not load this')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Try again|Retry/ }));

    expect(await screen.findByLabelText('Diff')).toHaveTextContent('second try');
  });

  it('shows each member of a group as its own block', async () => {
    const user = userEvent.setup();

    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: json({
          pipeline: ticketPipeline([
            stageView('review-group', {
              kind: 'group',
              label: 'Review and critique',
              status: 'running',
              members: [
                stageView('review', {
                  label: 'Review',
                  status: 'passed',
                  counts: { critical: 0, high: 0, medium: 0, low: 0 },
                }),
                stageView('critique', { label: 'Critique', status: 'running' }),
              ],
            }),
            stageView('merge', { kind: 'merge', label: 'Merge' }),
          ]),
        }),
      },
    });

    await strip();
    await user.click(chip('Review and critique', 'Running'));

    const detail = await screen.findByRole('region', {
      name: 'Details of Review and critique',
    });

    expect(within(detail).getByRole('heading', { name: 'Review' })).toBeVisible();
    expect(within(detail).getByRole('heading', { name: 'Critique' })).toBeVisible();
    expect(within(detail).getByText('No findings')).toBeVisible();
  });

  it('opens and closes the detail from the keyboard', async () => {
    const user = userEvent.setup();

    renderApp({ path: TICKET, routes });
    await strip();

    chip('Review', 'Failed').focus();
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('region', { name: 'Details of Review' }),
    ).toBeVisible();

    expect(chip('Review', 'Failed')).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Enter}');

    expect(screen.queryByRole('region', { name: 'Details of Review' })).toBeNull();
  });
});
