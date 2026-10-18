/**
 * Pins: the ticket's pipeline strip: one chip per stage with its status in words, "Rework 1 of
 * 2", stages a routing rule added, the empty and error states, the strip following the ticket,
 * and the checks' findings on the Review tab.
 *
 * Why: the strip is the owner's answer to "where is this ticket and why is it not done". A chip
 * that shows only colour, a rework count that hides the cap, or a strip that goes stale while the
 * ticket moves would each send the owner to the wrong decision.
 * Depends on: routes/ticket/pipeline-strip, the stubbed Forge server.
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

describe('pipeline strip: states', () => {
  it('says when the pipeline starts while the ticket has not been dispatched', async () => {
    renderApp({ path: TICKET });

    expect(
      await screen.findByText('Starts when the ticket is dispatched.'),
    ).toBeVisible();

    expect(screen.queryByRole('list', { name: 'Pipeline stages' })).toBeNull();
  });

  it('shows loading, then each stage with its status in words and the lane', async () => {
    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: {
          delayMs: 150,
          body: {
            pipeline: ticketPipeline(
              stages({
                'test-writer': { status: 'passed' },
                implementer: { status: 'running', run_id: 'run-svc-1a' },
                g1: { status: 'pending' },
              }),
            ),
          },
        },
      },
    });

    expect(
      await screen.findByRole('status', { name: 'Loading pipeline' }),
    ).toBeInTheDocument();

    await strip();

    expect(screen.getByText('standard lane')).toBeVisible();
    expect(chip('Write failing tests', 'Passed')).toBeVisible();
    expect(chip('Implement', 'Running')).toBeVisible();
    expect(chip('Gate G1', 'Not yet')).toBeVisible();
    expect(chip('Merge', 'Not yet')).toBeVisible();
    expect(screen.queryByText(/Rework \d of/)).toBeNull();
  });

  it('words every status, never colour alone', async () => {
    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: json({
          pipeline: ticketPipeline([
            stageView('a', { label: 'Stage A', status: 'failed' }),
            stageView('b', { label: 'Stage B', status: 'waiting' }),
            stageView('c', { label: 'Stage C', status: 'adopted' }),
            stageView('d', { label: 'Stage D', status: 'error' }),
            stageView('e', { label: 'Stage E', status: 'skipped' }),
          ]),
        }),
      },
    });

    await strip();

    expect(chip('Stage A', 'Failed')).toBeVisible();
    expect(chip('Stage B', 'Waiting for you')).toBeVisible();
    expect(chip('Stage C', 'Done earlier')).toBeVisible();
    expect(chip('Stage D', 'Could not run')).toBeVisible();
    expect(chip('Stage E', 'Skipped')).toBeVisible();
  });

  it('shows an error with a way to try again, and recovers', async () => {
    const user = userEvent.setup();

    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: sequence(
          refusal(500, 'boom'),
          json({ pipeline: ticketPipeline(STANDARD_STAGES) }),
        ),
      },
    });

    expect(await screen.findByText(/Could not load the pipeline/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await strip();
    expect(chip('Implement', 'Not yet')).toBeVisible();
  });
});

describe('pipeline strip: rework, held and routed stages', () => {
  it('shows the rework count against its cap and the round a stage is in', async () => {
    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: json({
          pipeline: ticketPipeline(
            stages({
              'test-writer': { status: 'adopted' },
              implementer: { status: 'running', cycle: 1 },
            }),
            { rework: { count: 1, cap: 2 } },
          ),
        }),
      },
    });

    await strip();

    expect(screen.getByText('Rework 1 of 2')).toBeVisible();
    expect(chip('Implement', 'Running, round 2')).toBeVisible();
  });

  it('shows a check held for the owner as waiting for them', async () => {
    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: json({
          pipeline: ticketPipeline(
            stages({ g1: { status: 'passed' }, reviewer: { status: 'waiting' } }),
          ),
        }),
      },
    });

    await strip();

    expect(chip('Review', 'Waiting for you')).toBeVisible();
  });

  it('marks a stage a routing rule added, and names the rule in its detail', async () => {
    const user = userEvent.setup();

    renderApp({
      path: TICKET,
      routes: {
        [PIPELINE]: json({
          pipeline: ticketPipeline(
            [
              ...STANDARD_STAGES.slice(0, 4),
              stageView('net-review', {
                label: 'Network review',
                status: 'pending',
                agent: { id: 'reviewer-net', name: 'Network reviewer' },
              }),
              STANDARD_STAGES[4] as (typeof STANDARD_STAGES)[number],
            ],
            {
              routed: [
                {
                  rule_id: 'tf-net',
                  agent: 'reviewer-net',
                  stage_id: 'net-review',
                  at: 'diff',
                },
              ],
            },
          ),
        }),
      },
    });

    await strip();

    expect(chip('Network review', 'Not yet, added by rule')).toBeVisible();

    await user.click(chip('Network review', 'Not yet'));

    expect(await screen.findByText('Added by the routing rule “tf-net”.')).toBeVisible();
  });
});

describe('Review tab: what the checks found', () => {
  const found = ticketPipeline(
    stages({
      g1: { status: 'passed' },
      reviewer: {
        status: 'passed',
        agent: { id: 'reviewer', name: 'Reviewer' },
        summary: 'One naming nit; the logic holds.',
        counts: { critical: 0, high: 0, medium: 0, low: 1 },
      },
    }),
    { rework: { count: 1, cap: 2 } },
  );

  it('lists each reporting check with its counts and words, and the rework it took', async () => {
    renderApp({
      path: '/p/sample-service/tickets/SVC-5/review',
      routes: { 'GET /tickets/SVC-5/pipeline': json({ pipeline: found }) },
    });

    const section = await screen.findByRole('region', { name: 'What the checks found' });

    expect(within(section).getByText('1 low')).toBeVisible();
    expect(within(section).getByText('One naming nit; the logic holds.')).toBeVisible();
    expect(
      within(section).getByText(/went back to its writer for rework \(rework 1 of 2\)/),
    ).toBeVisible();
  });

  it('says nothing for a ticket whose pipeline has no reporting check', async () => {
    renderApp({
      path: '/p/sample-service/tickets/SVC-5/review',
      routes: {
        'GET /tickets/SVC-5/pipeline': json({
          pipeline: ticketPipeline(
            [stageView('implementer', { label: 'Implement', status: 'passed' })],
            { lane: 'express' },
          ),
        }),
      },
    });

    await screen.findByRole('tab', { name: 'Review' });
    await screen.findByRole('list', { name: 'Pipeline stages' });

    expect(screen.queryByText('What the checks found')).toBeNull();
  });
});
