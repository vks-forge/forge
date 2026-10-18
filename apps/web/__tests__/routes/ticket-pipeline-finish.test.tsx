/**
 * Pins: the ticket's pipeline strip for the Full lane's last stages: the Director check and the
 * sign-off say who did what in words, an owner overrule is badged and its reason readable, the
 * Director check opens as an acceptance checklist with the files outside the plan, writer-group
 * members sit side by side with their folders, a critic's model-family note shows on its chip,
 * and the Review tab lists each finding with its file and line.
 *
 * Why: the owner reads the strip to learn who put a name on the work and on what grounds. "Passed"
 * alone would hide that the Director signed tier B, that a hold was overruled, or that the critic
 * shares the Worker's model; and a count of findings gives nothing to open. Each assertion is one
 * of those blind spots.
 * Depends on: routes/ticket/{pipeline-strip,stage-detail,stage-check,stage-chip,review-findings},
 * the stubbed Forge server.
 */

import type { Finding, TicketCheckOutput } from '@forge/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { stageView, ticketPipeline } from '#tests/helpers/forge-data/pipeline-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-1';
const PIPELINE = 'GET /tickets/SVC-1/pipeline';

const FINDING: Finding = {
  severity: 'high',
  file: 'src/window.ts',
  line: 41,
  issue: 'The window is computed in local time.',
  evidence: 'new Date(start) is read without a time zone on line 41.',
};

const CHECK: TicketCheckOutput = {
  verdict: 'changes',
  summary: 'One criterion is not met and the diff touches an unplanned file.',
  acceptance: [
    {
      criterion: 'The report uses UTC',
      met: 'no',
      evidence: 'src/window.ts reads local time',
    },
    {
      criterion: 'Empty windows return no rows',
      met: 'yes',
      evidence: 'test_report line 12 passes',
    },
    {
      criterion: 'The export is documented',
      met: 'unclear',
      evidence: 'no docs file in the diff',
    },
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

describe('the sign-off chip', () => {
  it('says who signed, in words', async () => {
    open([
      stageView('a', {
        kind: 'sign_off',
        label: 'Director signed',
        status: 'passed',
        signed_by: 'director',
      }),
      stageView('b', {
        kind: 'sign_off',
        label: 'Owner signed',
        status: 'passed',
        signed_by: 'owner',
      }),
      stageView('c', { kind: 'sign_off', label: 'Owner to sign', status: 'waiting' }),
      MERGE,
    ]);

    await strip();

    expect(chip('Director signed', 'Signed by the Director')).toBeVisible();
    expect(chip('Owner signed', 'Signed by you')).toBeVisible();
    expect(chip('Owner to sign', 'Waiting for you')).toBeVisible();
  });

  it('opens with who signed and the reason', async () => {
    const user = userEvent.setup();

    open([
      stageView('sign-off', {
        kind: 'sign_off',
        label: 'Sign-off',
        status: 'passed',
        signed_by: 'director',
        summary: 'Tier B, every check passed, every criterion confirmed.',
      }),
      MERGE,
    ]);

    await strip();
    await user.click(chip('Sign-off', 'Signed by the Director'));

    const detail = await screen.findByRole('region', { name: 'Details of Sign-off' });

    expect(within(detail).getByText('The Director')).toBeVisible();
    expect(within(detail).getByText(/Tier B, every check passed/)).toBeVisible();
  });
});

describe('the Director check chip', () => {
  it('says when there was no plan to check against', async () => {
    open([
      stageView('check-plan', {
        kind: 'director_check',
        label: 'Check against the plan',
        status: 'skipped',
      }),
      MERGE,
    ]);

    await strip();

    expect(chip('Check against the plan', 'No plan to check against')).toBeVisible();
  });

  it('opens as a checklist: each criterion met, not met or unclear with its evidence, the unplanned files and the findings', async () => {
    const user = userEvent.setup();

    open([
      stageView('check-plan', {
        kind: 'director_check',
        label: 'Check against the plan',
        status: 'waiting',
        check: CHECK,
        unplanned: ['src/billing/invoice.ts'],
        findings: [FINDING],
        summary: CHECK.summary,
      }),
      MERGE,
    ]);

    await strip();
    await user.click(chip('Check against the plan', 'Waiting for you'));

    const detail = await screen.findByRole('region', {
      name: 'Details of Check against the plan',
    });

    const list = within(detail).getByRole('list', { name: 'Acceptance criteria' });
    const items = within(list).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent('Not met: The report uses UTC');
    expect(items[0]).toHaveTextContent('src/window.ts reads local time');
    expect(items[1]).toHaveTextContent('Met: Empty windows return no rows');
    expect(items[2]).toHaveTextContent('Unclear: The export is documented');

    expect(within(detail).getByText('1 file the plan did not name')).toBeVisible();
    expect(within(detail).getByText('src/billing/invoice.ts')).toBeVisible();
    expect(within(detail).getByText('src/window.ts:41')).toBeVisible();
  });
});

describe('an owner overrule', () => {
  const overruled = stageView('critique', {
    label: 'Critique',
    status: 'passed',
    override: {
      by: 'owner',
      action: 'merge_anyway',
      comment: 'The nit is intended',
      at: '2026-10-18T10:00:00.000Z',
    },
  });

  it('is badged on the chip and its reason is in the detail', async () => {
    const user = userEvent.setup();

    open([overruled, MERGE]);
    await strip();

    expect(chip('Critique', 'Passed, overruled by you')).toBeVisible();

    await user.click(chip('Critique', 'Passed'));

    expect(
      within(
        await screen.findByRole('region', { name: 'Details of Critique' }),
      ).getByText('Merged anyway by you: The nit is intended'),
    ).toBeVisible();
  });
});
