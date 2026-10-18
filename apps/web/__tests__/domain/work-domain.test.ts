/**
 * Pins: optimistic inbox marks move items and counts exactly as the server's view rule does;
 * numbers and durations read the same everywhere and a missing value is never 0; inbox links
 * lead to the item's source; the work http adapter writes slugs, item ids and repeated
 * statuses into URLs correctly.
 *
 * Why: these are the small rules every work screen leans on. A mark applied wrongly shows the
 *   user a list the server will contradict; a `$0.00` for "unreported" or a mangled item id
 *   in a URL (`question:q-1` holds a colon) is a wrong answer shown with confidence.
 * Depends on: domain/inbox-marks, domain/stats-format, domain/inbox-links, api/http/work-http.
 */

import { describe, expect, it } from 'vitest';
import { createWorkHttp } from '#/api/http/work-http.js';
import { inboxLink } from '#/domain/inbox-links.js';
import { applyMarkToCounts, applyMarkToPages, undoOf } from '#/domain/inbox-marks.js';
import { runStatusView } from '#/domain/run-format.js';
import { formatDuration, formatTokens, formatUsd } from '#/domain/stats-format.js';
import { stageOf } from '#/domain/ticket-stage.js';
import { stubFetch } from '#tests/helpers/fetch-stub.js';
import { inboxItem } from '#tests/helpers/work-fixtures.js';

describe('inbox marks', () => {
  const item = inboxItem();
  const counts = { needs_action: 2, unread: 2, all: 2, archived: 0 };

  it('removes an archived item from a view it no longer belongs to', () => {
    const pages = [{ items: [item, inboxItem({ id: 'question:q-2' })], nextCursor: 'c' }];

    const next = applyMarkToPages(pages, 'needs_action', item.id, 'archive');

    expect(next[0]?.items.map((i) => i.id)).toEqual(['question:q-2']);
    expect(next[0]?.nextCursor).toBe('c');
  });

  it('keeps a read item in the view and flips its flag', () => {
    const next = applyMarkToPages(
      [{ items: [item], nextCursor: null }],
      'all',
      item.id,
      'read',
    );

    expect(next[0]?.items[0]?.read).toBe(true);
  });

  it('moves the counts like the server would', () => {
    expect(applyMarkToCounts(counts, item, 'archive')).toEqual({
      needs_action: 1,
      unread: 1,
      all: 1,
      archived: 1,
    });

    expect(applyMarkToCounts(counts, item, 'read')).toEqual({ ...counts, unread: 1 });
  });

  it('reverses each mark', () => {
    expect(undoOf('archive')).toBe('unarchive');
    expect(undoOf('read')).toBe('unread');
  });
});

describe('formatting', () => {
  it('never shows an unreported amount as zero dollars', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
  });

  it('formats durations and token counts', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(725_000)).toBe('12m 05s');
    expect(formatDuration(12_000_000)).toBe('3h 20m');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(15_000)).toBe('15k');
    expect(formatTokens(4_100_000)).toBe('4.1M');
  });

  it('names a quota-parked run parked, whatever its stored status', () => {
    expect(runStatusView({ status: 'running', paused_harness: true }).label).toBe(
      'Parked: quota',
    );

    expect(runStatusView({ status: 'error', paused_harness: false }).tone).toBe('bad');
  });

  it('folds ticket statuses into five stages', () => {
    expect(stageOf('planned')).toBe(0);
    expect(stageOf('waiting_human')).toBe(1);
    expect(stageOf('needs_signoff')).toBe(3);
  });
});

describe('inbox links', () => {
  it('leads each kind to its source', () => {
    expect(inboxLink('p', inboxItem()).to).toBe('/p/p/tickets/SVC-3');
    expect(
      inboxLink('p', inboxItem({ id: 'memory_proposal:x-0003', kind: 'memory_proposal' }))
        .to,
    ).toBe('/p/p/memory/x-0003');

    expect(
      inboxLink(
        'p',
        inboxItem({ id: 'gate_failed:g1', kind: 'gate_failed', run_id: 'run-9' }),
      ).to,
    ).toBe('/p/p/runs?run=run-9');

    expect(
      inboxLink('p', inboxItem({ id: 'quota_wait:claude', kind: 'quota_wait' })).to,
    ).toBe('/settings/harnesses/claude');
  });

  it('opens the harness section where a tool or a compatibility check is decided', () => {
    const tool = inboxLink(
      'p',
      inboxItem({ id: 'tool_approval:claude/2.1.142/shell', kind: 'tool_approval' }),
    );

    const compat = inboxLink(
      'p',
      inboxItem({ id: 'harness_compat:claude/2.1.142', kind: 'harness_compat' }),
    );

    expect(tool).toEqual({
      to: '/settings/harnesses/claude#tools',
      label: 'Review tool',
    });

    expect(compat).toEqual({
      to: '/settings/harnesses/claude#compat',
      label: 'Open check',
    });
  });

  it('falls back to the harness list when the item names no harness', () => {
    const link = inboxLink(
      'p',
      inboxItem({ id: 'tool_approval', kind: 'tool_approval' }),
    );

    expect(link).toEqual({ to: '/settings/harnesses', label: 'Open harnesses' });
  });
});

describe('work http adapter', () => {
  const stub = stubFetch({
    'POST /projects/p%20q/inbox/ticket_review%3ASVC-5%2Fx/read': {
      body: inboxItem({ read: true }),
    },
    'GET /projects/p%20q/runs': { body: { items: [], nextCursor: null } },
  });

  const api = createWorkHttp({ baseUrl: '/api', fetch: stub.fetch });

  it('encodes an item id with colons and slashes and returns the updated item', async () => {
    const item = await api.inbox.mark('p q', 'ticket_review:SVC-5/x', 'read');

    expect(item.read).toBe(true);
  });

  it('repeats the status parameter for a multi-status filter', async () => {
    await api.runs.list('p q', { status: ['error', 'timeout'], limit: 50 });

    expect(stub.callsTo('GET /projects/p%20q/runs')[0]?.path).toBe(
      '/projects/p%20q/runs?status=error&status=timeout&limit=50',
    );
  });
});
