/**
 * Pins: what the Director changed on a ticket's own pipeline copy shows on the strip: a badge on
 * an added, moved or swapped stage with its reason in the detail, a removed stage kept as a ghost
 * with its reason, a headline counting the changes that opens the log (applied and not applied),
 * and a stage that ran on a fallback or as a substitute says so.
 *
 * Why: the owner approved the lane and the plan, not what the Director later did to this ticket's
 * copy. If an added reviewer, a vanished check or a different model were not visible, the owner could
 * not tell their own pipeline from the Director's, nor who wrote the code.
 * Depends on: routes/ticket/{pipeline-strip,director-changes,stage-chip,stage-detail}, the stubbed
 * Forge server.
 */

import type { PipelineAdjustment } from '@forge/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import {
  STANDARD_STAGES,
  stageView,
  ticketPipeline,
} from '#tests/helpers/forge-data/pipeline-data.js';
import { renderApp } from '#tests/helpers/render-app.js';

const TICKET = '/p/sample-service/tickets/SVC-3';
const PIPELINE = 'GET /tickets/SVC-3/pipeline';
const AT = '2026-10-17T10:00:00.000Z';

const SECURITY = {
  id: 'dir-security',
  kind: 'agent' as const,
  label: 'Security review',
  agent: 'reviewer',
};

const applied: PipelineAdjustment = {
  seq: 1,
  op: { op: 'add', stage: SECURITY, after: 'g1', reason: 'It edits the login handler.' },
  by: 'director',
  cause: 'plan',
  key: 'standard:add:dir-security@after:g1',
  status: 'applied',
  at: AT,
};

const dropped: PipelineAdjustment = {
  seq: 2,
  op: { op: 'remove', stage_id: 'g1', reason: 'The gate is slow for a typo fix.' },
  by: 'director',
  cause: 'plan',
  key: 'standard:remove:g1',
  status: 'dropped',
  problem: 'g1 is locked and cannot be removed.',
  at: AT,
};

function open(stages = STANDARD_STAGES, over: Parameters<typeof ticketPipeline>[1] = {}) {
  return renderApp({
    path: TICKET,
    routes: { [PIPELINE]: json({ pipeline: ticketPipeline(stages, over) }) },
  });
}

const withAdded = [
  ...STANDARD_STAGES.slice(0, 3),
  stageView('dir-security', {
    label: 'Security review',
    agent: { id: 'reviewer', name: 'Reviewer' },
    changed: {
      by: 'director',
      op: 'add',
      cause: 'plan',
      reason: 'It edits the login handler.',
    },
  }),
  ...STANDARD_STAGES.slice(3),
];

describe('pipeline strip: Director changes', () => {
  it('marks a stage the Director added and says why in its detail', async () => {
    const user = userEvent.setup();
    open(withAdded, { adjustments: [applied], base_hash: 'c'.repeat(64) });

    const chip = await screen.findByRole('button', { name: /^Security review/ });

    expect(within(chip).getByText('Added by Director')).toBeInTheDocument();

    await user.click(chip);
    const detail = await screen.findByRole('region', {
      name: 'Details of Security review',
    });

    expect(detail).toHaveTextContent(
      'Added by the Director: It edits the login handler.',
    );
  });

  it('keeps a removed stage as a ghost with the reason', async () => {
    const stages = STANDARD_STAGES.filter((s) => s.id !== 'reviewer');
    open(stages, {
      removed: [
        { id: 'reviewer', label: 'Review', reason: 'A typo fix needs no review.' },
      ],
    });

    const list = await screen.findByRole('list', { name: 'Pipeline stages' });

    expect(within(list).getByText('Review')).toHaveClass('line-through');
    expect(
      within(list).getByText('Removed by the Director: A typo fix needs no review.'),
    ).toBeInTheDocument();
  });

  it('opens a log of every change, with the ones not applied and why', async () => {
    const user = userEvent.setup();
    open(withAdded, { adjustments: [applied, dropped] });

    const headline = await screen.findByRole('button', {
      name: 'Changed by the Director (1 change), 1 not applied',
    });

    expect(headline).toHaveAttribute('aria-expanded', 'false');

    await user.click(headline);
    const log = await screen.findByRole('list', { name: 'What the Director changed' });

    expect(within(log).getAllByRole('listitem')[0]).toHaveTextContent(
      'Add Security review after g1: It edits the login handler.',
    );

    expect(within(log).getAllByRole('listitem')[1]).toHaveTextContent(
      'Not applied: Remove g1. g1 is locked and cannot be removed.',
    );
  });

  it('shows no Director line on a ticket the Director left alone', async () => {
    open();

    await screen.findByRole('list', { name: 'Pipeline stages' });

    expect(screen.queryByText(/Changed by the Director/)).toBeNull();
    expect(screen.queryByText(/by Director/)).toBeNull();
  });

  it('says a stage ran on a fallback and which model, and a substitute as such', async () => {
    const user = userEvent.setup();
    const stages = STANDARD_STAGES.map((s) =>
      s.id === 'implementer'
        ? {
            ...s,
            status: 'passed' as const,
            ran_on: { harness: 'claude', model: 'sonnet', slot: 2 },
          }
        : s.id === 'test-writer'
          ? {
              ...s,
              status: 'passed' as const,
              ran_on: { harness: 'claude', model: 'haiku', slot: -1 },
              changed: {
                by: 'director' as const,
                op: 'swap' as const,
                cause: 'fallback' as const,
                reason: 'The first agent had no model left.',
              },
            }
          : s,
    );

    open(stages);

    const implement = await screen.findByRole('button', { name: /^Implement/ });

    expect(implement).toHaveTextContent('ran on fallback 2');

    await user.click(implement);

    expect(await screen.findByText('Ran on fallback 2 (sonnet)')).toBeInTheDocument();

    const tests = screen.getByRole('button', { name: /^Write failing tests/ });

    expect(tests).toHaveTextContent('ran as substitute');
    expect(within(tests).getByText('Substitute')).toBeInTheDocument();

    await user.click(tests);

    expect(
      await screen.findByText(
        'Substitute agent chosen by the Director: The first agent had no model left.',
      ),
    ).toBeInTheDocument();
  });
});
