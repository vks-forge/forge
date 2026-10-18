/**
 * Pins: the words for what the Director changed in a ticket's pipeline and where a stage ran: each
 * op in plain words, the badge and the sentence for an added, moved, swapped or substitute stage,
 * the ghost line of a removed stage, the log line of an applied or dropped change, the headline that
 * counts them, which slot a run used, and what makes a plan a lighter pipeline.
 *
 * Why: the owner must tell their own lane from the Director's changes and know who really wrote the
 * code. A badge that reads the same for an added reviewer and a substitute writer, a dropped op
 * worded as applied, or a fallback run that says nothing would each hide exactly that.
 * Depends on: domain/director-change-copy, @forge/core (types).
 */

import type { PipelineAdjustment, PipelineAdjustOp } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  adjustmentLine,
  changeBadge,
  changedLine,
  changesHeadline,
  isLighter,
  laneWithOpsLine,
  lighterWords,
  opWords,
  ranOnLine,
  ranOnShort,
  removedLine,
  slotWords,
} from '#/domain/director-change-copy.js';

const STAGE = {
  id: 'dir-sec',
  kind: 'agent' as const,
  label: 'Security review',
  agent: 'reviewer',
};

const REASON = 'A reason of ten characters or more.';

const add: PipelineAdjustOp = { op: 'add', stage: STAGE, after: 'g1', reason: REASON };
const remove: PipelineAdjustOp = { op: 'remove', stage_id: 'reviewer', reason: REASON };
const swap: PipelineAdjustOp = {
  op: 'swap',
  stage_id: 'implementer',
  agent: 'frontend-writer',
  reason: REASON,
};

const move: PipelineAdjustOp = {
  op: 'move',
  stage_id: 'reviewer',
  after: 'implementer',
  reason: REASON,
};

const log = (
  op: PipelineAdjustOp,
  over: Partial<PipelineAdjustment> = {},
): PipelineAdjustment => ({
  seq: 1,
  op,
  by: 'director',
  cause: 'plan',
  key: 'k',
  status: 'applied',
  at: '2026-10-18T10:00:00.000Z',
  ...over,
});

describe('opWords', () => {
  it('words every op', () => {
    expect(opWords(add)).toBe('Add Security review after g1');
    expect(opWords(remove)).toBe('Remove reviewer');
    expect(opWords(swap)).toBe('Swap implementer to agent frontend-writer');
    expect(opWords(move)).toBe('Move reviewer after implementer');
  });

  it('names the group member when a member is swapped', () => {
    expect(opWords({ ...swap, member_id: 'critique' })).toBe(
      'Swap critique to agent frontend-writer',
    );
  });
});

describe('a changed stage', () => {
  it('has its own badge for each change, and a substitute reads as one', () => {
    const changed = (op: 'add' | 'move' | 'swap', cause: 'plan' | 'fallback') => ({
      by: 'director' as const,
      op,
      cause,
      reason: REASON,
    });

    expect(changeBadge(changed('add', 'plan'))).toBe('Added by Director');
    expect(changeBadge(changed('move', 'plan'))).toBe('Moved by Director');
    expect(changeBadge(changed('swap', 'plan'))).toBe('Swapped by Director');
    expect(changeBadge(changed('swap', 'fallback'))).toBe('Substitute');
  });

  it('puts the reason after what happened', () => {
    const base = { by: 'director' as const, reason: 'It edits login.' };

    expect(changedLine({ ...base, op: 'add', cause: 'plan' })).toBe(
      'Added by the Director: It edits login.',
    );

    expect(changedLine({ ...base, op: 'swap', cause: 'fallback' })).toBe(
      'Substitute agent chosen by the Director: It edits login.',
    );
  });
});

describe('where a stage ran', () => {
  it('says nothing for the first choice', () => {
    expect(ranOnLine({ harness: 'claude', model: 'opus', slot: 0 })).toBeNull();
    expect(ranOnShort({ harness: 'claude', slot: 0 })).toBe('');
    expect(ranOnShort(undefined)).toBe('');
    expect(slotWords(0)).toBeUndefined();
    expect(slotWords(undefined)).toBeUndefined();
  });

  it('names the fallback and its model, or the harness when there is no model', () => {
    expect(ranOnLine({ harness: 'claude', model: 'sonnet', slot: 2 })).toBe(
      'Ran on fallback 2 (sonnet)',
    );

    expect(ranOnLine({ harness: 'codex', slot: 1 })).toBe('Ran on fallback 1 (codex)');
    expect(ranOnShort({ harness: 'claude', slot: 2 })).toBe(', ran on fallback 2');
    expect(slotWords(3)).toBe('on fallback 3');
  });

  it('says a substitute ran as the substitute', () => {
    expect(ranOnLine({ harness: 'claude', model: 'haiku', slot: -1 })).toBe(
      'Ran as the substitute agent (haiku)',
    );

    expect(ranOnShort({ harness: 'claude', slot: -1 })).toBe(', ran as substitute');
    expect(slotWords(-1)).toBe('as the substitute');
  });
});

describe('the log and its headline', () => {
  it('words an applied change with its reason and a dropped one with its problem', () => {
    expect(adjustmentLine(log(add))).toBe(`Add Security review after g1: ${REASON}`);
    expect(
      adjustmentLine(log(remove, { status: 'dropped', problem: 'g1 is locked.' })),
    ).toBe('Not applied: Remove reviewer. g1 is locked.');

    expect(adjustmentLine(log(remove, { status: 'dropped' }))).toBe(
      'Not applied: Remove reviewer. It no longer fit the lane.',
    );
  });

  it('counts applied changes and the ones not applied apart', () => {
    expect(changesHeadline([log(add)])).toBe('Changed by the Director (1 change)');
    expect(changesHeadline([log(add), log(swap)])).toBe(
      'Changed by the Director (2 changes)',
    );

    expect(changesHeadline([log(add), log(remove, { status: 'dropped' })])).toBe(
      'Changed by the Director (1 change), 1 not applied',
    );

    expect(changesHeadline([log(remove, { status: 'dropped' })])).toBe(
      'The Director’s changes were not applied (1)',
    );
  });

  it('words a removed stage as a ghost', () => {
    expect(removedLine({ id: 'reviewer', label: 'Review', reason: 'Typo fix.' })).toBe(
      'Removed by the Director: Typo fix.',
    );
  });
});

describe('a lighter pipeline', () => {
  it('is any plan that removes a stage, and names what goes', () => {
    expect(isLighter([add, swap, move])).toBe(false);
    expect(isLighter([add, remove])).toBe(true);
    expect(lighterWords([add])).toBeNull();
    expect(lighterWords([remove, { ...remove, stage_id: 'critique' }])).toBe(
      'Needs your approval: removes reviewer, critique',
    );
  });

  it('counts the changes on the ticket line', () => {
    expect(laneWithOpsLine('standard', [add, remove])).toBe(
      'Standard + 2 Director changes',
    );

    expect(laneWithOpsLine('express', [add])).toBe('Express + 1 Director change');
    expect(laneWithOpsLine(undefined, [add])).toBe('Lane + 1 Director change');
  });
});
