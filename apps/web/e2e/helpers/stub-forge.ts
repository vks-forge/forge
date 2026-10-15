/**
 * Browser-level stand-in for the Forge server, used by the Playwright smoke.
 *
 * Why: the app talks only to the real server API (d-0123), so the smoke answers the browser's
 *   `/api/*` requests itself with `page.route` instead of a fixture adapter in the bundle.
 *   It covers exactly what the Board and Ticket page call: projects, the ticket list and
 *   detail, an SSE ticket, a run's event stream (a short, finished stream sent as real
 *   `text/event-stream`), answering a question and chat intake. Data is plainly sample data.
 *
 * Exports: stubForge().
 * Depends on: @playwright/test.
 */

import type { Page, Route } from '@playwright/test';

const NOW = Date.now();
const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

const projects = [
  {
    id: 'fixture-1',
    slug: 'sample-service',
    prefix: 'SVC',
    status: 'ready',
    ecosystems: ['node'],
  },
  {
    id: 'fixture-2',
    slug: 'sample-web',
    prefix: 'WEB',
    status: 'ready',
    ecosystems: ['node'],
  },
];

const summary = (
  id: string,
  title: string,
  state: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  title,
  state,
  lane: 'standard',
  type: 'feat',
  tier_predicted: 'A',
  project: 'sample-service',
  priority: 0,
  rework_count: 0,
  needs_you: ['waiting_human', 'review', 'needs_signoff'].includes(state),
  created_at: ago(120),
  updated_at: ago(5),
  ...extra,
});

const tickets = [
  summary('SVC-3', 'Stream large CSV exports', 'in_progress', {
    run_id: 'run-3',
    run_status: 'running',
  }),
  summary('SVC-4', 'Fix off-by-one in the nightly report', 'waiting_human', {
    run_id: 'run-4',
    run_status: 'settled',
  }),
  summary('SVC-5', 'Move sessions to a composite key', 'review', { lane: 'full' }),
  summary('SVC-6', 'Document the rate limits', 'planned', { lane: 'express' }),
  summary('SVC-8', 'Reject oversized uploads', 'verifying', { rework_count: 1 }),
  summary('SVC-1', 'Retry webhook sends', 'done', { lane: 'express' }),
];

function detail(id: string) {
  const row = (tickets.find((t) => t.id === id) ?? tickets[1]!) as Record<
    string,
    string | number | boolean | undefined
  >;

  const waiting = row.id === 'SVC-4';

  return {
    ticket: {
      id: row.id,
      project: 'fixture-1',
      title: row.title,
      body: 'Sample request.',
      type: 'feat',
      lane: row.lane,
      tier_predicted: 'A',
      status: row.state,
      status_version: 1,
      rework_count: row.rework_count,
      priority: 0,
      assignee_run_id: row.run_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      blocked_by: [],
    },
    runs: row.run_id
      ? [
          {
            id: row.run_id,
            ticket_id: row.id,
            harness: 'claude-code',
            driver_version: '0.1.0',
            cwd: 'sample/workspace',
            lane: row.lane,
            started_at: ago(30),
            status: row.run_status,
            owner: 'sample',
          },
        ]
      : [],
    gate_results: [
      {
        id: 1,
        run_id: row.run_id ?? 'run-x',
        gate: 'G1',
        status: 'passed',
        started_at: ago(20),
      },
    ],
    interactions: waiting
      ? [
          {
            id: 'int-4',
            ticket_id: 'SVC-4',
            run_id: 'run-4',
            kind: 'question',
            payload: {},
            status: 'pending',
            asked_at: ago(10),
            timeout_at: ago(-600),
          },
        ]
      : [],
    wait_reason: null,
  };
}

const sse = (events: { type: string; [key: string]: unknown }[]): string =>
  `retry: 2000\n\n${events
    .map(
      (e, i) =>
        `id: ${i + 1}\nevent: ${e.type}\ndata: ${JSON.stringify({ seq: i + 1, ts: ago(9 - i), ...e })}\n\n`,
    )
    .join('')}event: end\ndata: {"status":"success"}\n\n`;

const stream = sse([
  { type: 'text', text: 'Reading the nightly report code.' },
  { type: 'tool_call', call_id: 'c1', name: 'Read', input: { path: 'src/report.ts' } },
  {
    type: 'tool_result',
    call_id: 'c1',
    output: 'export const window = 1;',
    is_error: false,
  },
  {
    type: 'ask',
    interaction_id: 'int-4',
    kind: 'question',
    prompt: 'Should the window use UTC or the account time zone?',
  },
]);

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Answers every `/api/*` call the Board and Ticket page make. */
export async function stubForge(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const path = pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/projects') {
      return json(route, { projects });
    }

    if (/^\/projects\/[^/]+\/tickets$/.test(path)) {
      return json(route, { items: tickets, nextCursor: null });
    }

    if (path.startsWith('/tickets/')) {
      return json(route, detail(decodeURIComponent(path.slice('/tickets/'.length))));
    }

    if (path === '/auth/sse-ticket' && method === 'POST') {
      return json(route, { ticket: 'sample-ticket', expires_in_s: 60 });
    }

    if (/^\/runs\/[^/]+\/events$/.test(path)) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
        body: stream,
      });
    }

    if (/^\/interactions\/[^/]+\/answer$/.test(path) && method === 'POST') {
      return json(route, { id: 'int-4', status: 'answered' });
    }

    if (path === '/intake' && method === 'POST') {
      return json(route, { status: 'ticket_created', ticketId: 'SVC-12' }, 202);
    }

    return json(
      route,
      { error: { code: 'not_stubbed', message: `no stub for ${path}` } },
      404,
    );
  });
}
