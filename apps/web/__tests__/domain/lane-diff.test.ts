/**
 * Pins: the lane diff lists the stages in the order the lane would run after a change, marking
 * the stage that was added, the one that went (kept where it stood), the one that only changed
 * place (and not the stages it jumped over), and the one whose agent changed.
 *
 * Why: the owner confirms a lane rewrite by reading this list. A removal that vanishes, a move
 * reported as several, or a swap shown as no change would each make them approve something other than
 * what they saw.
 * Depends on: domain/lane-diff, @forge/core (the shipped lanes).
 */

import { BUILTIN_PIPELINES } from '@forge/core';
import type { PipelineDefinition } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { laneDiff, laneDiffSummary } from '#/domain/lane-diff.js';

const standard = (): PipelineDefinition => structuredClone(BUILTIN_PIPELINES.standard);

const changes = (rows: ReturnType<typeof laneDiff>): [string, string][] =>
  rows.map((row) => [row.id, row.change]);

describe('laneDiff', () => {
  it('marks nothing when the lists are the same', () => {
    const rows = laneDiff(standard(), standard());

    expect(rows.every((row) => row.change === 'same')).toBe(true);
    expect(laneDiffSummary(rows)).toBeNull();
  });

  it('marks an added stage where it would stand', () => {
    const proposed = standard();
    const at = proposed.stages.findIndex((s) => s.id === 'g1');

    proposed.stages.splice(at + 1, 0, {
      id: 'dir-security',
      kind: 'agent',
      label: 'Security review',
      agent: 'reviewer',
    });

    const rows = laneDiff(standard(), proposed);

    expect(rows.map((row) => row.id)).toEqual([
      ...standard()
        .stages.slice(0, 3)
        .map((s) => s.id),
      'dir-security',
      ...standard()
        .stages.slice(3)
        .map((s) => s.id),
    ]);

    expect(changes(rows).find(([id]) => id === 'dir-security')).toEqual([
      'dir-security',
      'added',
    ]);

    expect(laneDiffSummary(rows)).toBe('1 added');
  });

  it('keeps a removed stage in its old place, marked removed', () => {
    const current = standard();
    const proposed = standard();
    const removedId = proposed.stages[3]!.id;

    proposed.stages = proposed.stages.filter((s) => s.id !== removedId);

    const rows = laneDiff(current, proposed);

    expect(rows).toHaveLength(current.stages.length);
    expect(rows[3]).toMatchObject({ id: removedId, change: 'removed' });
    expect(laneDiffSummary(rows)).toBe('1 removed');
  });

  it('marks only the stage that moved, not the ones it jumped over', () => {
    const proposed = standard();
    const [first] = proposed.stages.splice(0, 1);

    proposed.stages.splice(2, 0, first!);

    const rows = laneDiff(standard(), proposed);

    expect(rows.filter((row) => row.change === 'moved').map((row) => row.id)).toEqual([
      first!.id,
    ]);
  });

  it('marks a stage whose agent changed', () => {
    const proposed = standard();
    const stage = proposed.stages.find((s) => s.kind === 'agent')!;

    if (stage.kind === 'agent') {
      stage.agent = 'frontend-writer';
    }

    const rows = laneDiff(standard(), proposed);

    expect(rows.find((row) => row.id === stage.id)).toMatchObject({
      change: 'swapped',
      agent: 'frontend-writer',
    });
  });
});
