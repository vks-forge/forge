/**
 * Pins: the pages a Worker run read are listed in the run drawer ("Sources this run read") and
 * under each run on the ticket's Runs tab ("Pages this run read", loaded when opened), as
 * domain, title, time and size with an external link only for a real web address; and a review
 * finding that cites sources lists them as safe links.
 *
 * Why: when a result is doubted, "what did the Worker read?" comes first. Page titles and
 *   addresses are written by strangers, so a `javascript:` address must never become a link and
 *   every link out must leave without an opener handle or referrer. Loading only on request
 *   keeps a list of runs from asking the server about pages most runs never read.
 * Depends on: routes/runs/run-drawer, routes/ticket/tabs/runs-tab, components/research/run-sources,
 *   components/ticket/findings-list, helpers/render-work, helpers/render-app.
 */

import type { Finding } from '@forge/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { stageView, ticketPipeline } from '#tests/helpers/forge-data/pipeline-data.js';
import { renderApp } from '#tests/helpers/render-app.js';
import { renderWork } from '#tests/helpers/render-work.js';
import { runDetail, runSummary } from '#tests/helpers/work-fixtures.js';

const WHEN = '2026-10-16T09:05:00.000Z';

const page = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  project: 'sample-service',
  run_id: 'run-1',
  ticket_id: 'SVC-3',
  origin: 'worker',
  url: 'https://docs.example.com/csv',
  final_url: 'https://docs.example.com/csv',
  title: 'CSV streaming guide',
  retrieved_at: WHEN,
  sha256: 'abc',
  bytes: 20_480,
  truncated: false,
  ...over,
});

const RUNS = '/p/sample-service/runs';
const LIST = 'GET /projects/sample-service/runs';
const base = {
  [LIST]: { body: { items: [runSummary()], nextCursor: null } },
  'GET /runs/run-1': { body: runDetail() },
};

describe('Run drawer: sources this run read', () => {
  it('lists each page with its domain, title, size and a safe external link', async () => {
    renderWork(`${RUNS}?run=run-1`, {
      ...base,
      'GET /runs/run-1/sources': json({
        sources: [page(1), page(2, { title: '', truncated: true, bytes: 900 })],
      }),
    });

    const heading = await screen.findByRole('heading', { name: 'Sources this run read' });
    const list = await within(heading.parentElement as HTMLElement).findByRole('list', {
      name: 'Pages this run read',
    });

    const first = within(list).getAllByRole('listitem')[0] as HTMLElement;

    expect(first).toHaveTextContent('docs.example.com');
    expect(first).toHaveTextContent('CSV streaming guide');
    expect(first).toHaveTextContent('20 KB');

    const link = within(first).getByRole('link', {
      name: 'https://docs.example.com/csv',
    });

    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('cut short');
  });

  it('shows an address that is not http or https as text, never as a link', async () => {
    renderWork(`${RUNS}?run=run-1`, {
      ...base,
      'GET /runs/run-1/sources': json({
        sources: [
          page(1, { url: 'javascript:alert(1)', final_url: 'javascript:alert(1)' }),
        ],
      }),
    });

    const list = await screen.findByRole('list', { name: 'Pages this run read' });

    expect(within(list).getByText('javascript:alert(1)')).toBeVisible();
    expect(within(list).queryByRole('link')).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('says so when the run read nothing', async () => {
    renderWork(`${RUNS}?run=run-1`, {
      ...base,
      'GET /runs/run-1/sources': json({ sources: [] }),
    });

    expect(await screen.findByText('This run read no web pages.')).toBeVisible();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    const user = userEvent.setup();
    let failing = true;

    renderWork(`${RUNS}?run=run-1`, {
      ...base,
      'GET /runs/run-1/sources': () =>
        failing ? refusal(500, 'internal', 'Busy.') : json({ sources: [page(1)] }),
    });

    const retry = await screen.findByRole('button', { name: 'Try again' });
    failing = false;
    await user.click(retry);

    expect(
      await screen.findByRole('list', { name: 'Pages this run read' }),
    ).toBeVisible();
  });
});

describe('Ticket Runs tab: pages this run read', () => {
  it('asks the server only when a run is expanded', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({
      path: '/p/sample-service/tickets/SVC-1/runs',
      routes: { 'GET /runs/:id/sources': json({ sources: [page(1)] }) },
    });

    const region = await screen.findByRole('region', { name: 'Runs' });
    const toggles = await within(region).findAllByRole('button', {
      name: 'Pages this run read',
    });

    expect(forge.stub.callsTo('GET /runs/:id/sources')).toHaveLength(0);

    await user.click(toggles[0] as HTMLElement);

    expect(await within(region).findByText('CSV streaming guide')).toBeVisible();
    expect(forge.stub.callsTo('GET /runs/:id/sources')).toHaveLength(1);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Review findings: cited sources', () => {
  const FINDING: Finding = {
    severity: 'high',
    file: 'src/window.ts',
    line: 41,
    issue: 'The window is computed in local time.',
    evidence: 'The docs say to use UTC.',
    sources: ['https://docs.example.com/time', 'javascript:alert(1)'],
  };

  it('lists the pages a reviewer cited, linking only the real web addresses', async () => {
    renderApp({
      path: '/p/sample-service/tickets/SVC-5/review',
      routes: {
        'GET /tickets/SVC-5/pipeline': json({
          pipeline: ticketPipeline(
            [
              stageView('review', {
                label: 'Review',
                status: 'passed',
                counts: { critical: 0, high: 1, medium: 0, low: 0 },
                findings: [FINDING],
              }),
              stageView('merge', { kind: 'merge', label: 'Merge' }),
            ],
            { lane: 'full' },
          ),
        }),
      },
    });

    const cited = await screen.findByRole('list', { name: 'Sources cited' });
    const link = within(cited).getByRole('link', {
      name: 'docs.example.com · https://docs.example.com/time',
    });

    expect(link).toHaveAttribute('href', 'https://docs.example.com/time');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(within(cited).getByText('javascript:alert(1)')).toBeVisible();
    expect(within(cited).getAllByRole('link')).toHaveLength(1);

    await waitFor(() =>
      expect(document.querySelector('a[href^="javascript"]')).toBeNull(),
    );
  });
});
