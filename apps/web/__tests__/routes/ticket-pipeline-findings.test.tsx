/**
 * Pins: writer-group members side by side with their folders on the ticket strip, a critic's
 * model-family note on its chip and in its detail, and the Review tab listing each finding with its
 * file and line (the Director check's own included).
 *
 * Why: the owner needs to tell side-by-side writers apart by what they own, to know when the critic
 * shares the Worker's model, and to open the file a finding points at; a bare count gives nothing to
 * open.
 * Depends on: routes/ticket/{pipeline-strip,stage-detail,stage-chip,review-findings}, the stubbed
 * Forge server.
 */

import type { Finding, TicketCheckOutput } from '@forge/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { stageView, ticketPipeline } from '#tests/helpers/forge-data/pipeline-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-3';
const PIPELINE = 'GET /tickets/SVC-3/pipeline';

const FINDING: Finding = {
  severity: 'high',
  file: 'src/window.ts',
  line: 41,
  issue: 'The window is computed in local time.',
  evidence: 'new Date(start) is read without a time zone on line 41.',
};

const CHECK: TicketCheckOutput = {
  verdict: 'changes',
  summary: 'One criterion is not met.',
  acceptance: [
    { criterion: 'The report uses UTC', met: 'no', evidence: 'reads local time' },
  ],
  findings: [FINDING],
  confidence: 0.7,
};

const MERGE = stageView('merge', { kind: 'merge', label: 'Merge' });

function open(stages: ReturnType<typeof stageView>[], path = TICKET) {
  return renderApp({
    path,
    routes: { [PIPELINE]: json({ pipeline: ticketPipeline(stages, { lane: 'full' }) }) },
  });
}

const chip = (label: string, status: RegExp | string): HTMLElement =>
  screen.getByRole('button', {
    name: new RegExp(
      `^${label}\\s*${typeof status === 'string' ? status : status.source}`,
    ),
  });

async function strip(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Pipeline stages' });
}

describe('writer groups and notes', () => {
  it('shows writer-group members side by side with the folders each may write', async () => {
    open([
      stageView('writers', {
        kind: 'group',
        label: 'Writers together',
        status: 'running',
        members: [
          stageView('web', {
            label: 'Web writer',
            status: 'running',
            scope: ['apps/web/**'],
          }),
          stageView('api', {
            label: 'API writer',
            status: 'passed',
            scope: ['packages/**', 'docs/**'],
          }),
        ],
      }),
      MERGE,
    ]);

    const list = await strip();
    const frame = within(list).getByRole('group', { name: 'Writers together' });

    expect(
      within(frame).getByRole('button', { name: /^Web writer\s*Running/ }),
    ).toHaveTextContent('apps/web/**');

    expect(
      within(frame).getByRole('button', { name: /^API writer\s*Passed/ }),
    ).toHaveTextContent('packages/**, docs/**');
  });

  it('notes a critic on the Worker’s own model family on its chip and in its detail', async () => {
    const user = userEvent.setup();

    open([
      stageView('critique', {
        label: 'Critique',
        status: 'passed',
        warnings: ['The critic ran on the same model family as the Worker.'],
      }),
      MERGE,
    ]);

    await strip();
    await user.click(chip('Critique', 'Passed, has a note'));

    expect(await screen.findByRole('note')).toHaveTextContent(
      'The critic ran on the same model family as the Worker.',
    );
  });
});

describe('Review tab: each finding', () => {
  const stages = [
    stageView('review', {
      label: 'Review',
      status: 'passed',
      agent: { id: 'reviewer', name: 'Reviewer' },
      counts: { critical: 0, high: 1, medium: 0, low: 1 },
      findings: [
        {
          severity: 'low',
          file: 'src/report.ts',
          line: 9,
          issue: 'A name shadows an import.',
          evidence: 'line 9',
        },
        FINDING,
      ],
    }),
    stageView('check-plan', {
      kind: 'director_check',
      label: 'Check against the plan',
      status: 'passed',
      check: {
        ...CHECK,
        findings: [
          {
            ...FINDING,
            severity: 'medium',
            file: 'src/other.ts',
            line: 3,
            issue: 'Not in plan.',
          },
        ],
      },
    }),
    MERGE,
  ];

  it('lists findings worst first with file and line, and the Director check’s own', async () => {
    renderApp({
      path: '/p/sample-service/tickets/SVC-5/review',
      routes: {
        'GET /tickets/SVC-5/pipeline': json({
          pipeline: ticketPipeline(stages, { lane: 'full' }),
        }),
      },
    });

    const section = await screen.findByRole('region', { name: 'What the checks found' });
    const review = within(section).getByRole('list', { name: 'Findings from Review' });
    const items = within(review).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent('High');
    expect(items[0]).toHaveTextContent('src/window.ts:41');
    expect(items[0]).toHaveTextContent('new Date(start) is read without a time zone');
    expect(items[1]).toHaveTextContent('src/report.ts:9');

    expect(
      within(section).getByRole('list', { name: 'Findings from Check against the plan' }),
    ).toHaveTextContent('src/other.ts:3');
  });
});
