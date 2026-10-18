/**
 * Pins: the words of the ticket strip for the Director check and the sign-off, the line for an
 * owner overrule, the stage lookup that reaches inside a group, and the editor's per-row warnings.
 *
 * Why: the strip must say who signed and why a check did not run, not only "Passed"; an overrule
 * must read as the owner's act; a member of a group must be findable to open its detail; and a
 * warning must land on the row it names, not float in a list above all rows.
 * Depends on: src/domain/stage-view-copy, src/domain/pipeline-inspect. Pure.
 */

import { describe, expect, it } from 'vitest';
import { listWarnings, stageWarnings } from '#/domain/pipeline-inspect.js';
import { findStage, overrideLine, stageWords } from '#/domain/stage-view-copy.js';
import { stageView } from '#tests/helpers/forge-data/pipeline-data.js';
import { lane } from '#tests/helpers/pipeline-lists.js';

describe('stageWords', () => {
  it('says who signed a finished sign-off', () => {
    expect(
      stageWords(
        stageView('s', { kind: 'sign_off', status: 'passed', signed_by: 'director' }),
      ).label,
    ).toBe('Signed by the Director');

    expect(
      stageWords(
        stageView('s', { kind: 'sign_off', status: 'passed', signed_by: 'owner' }),
      ).label,
    ).toBe('Signed by you');
  });

  it('says why a Director check did not run, and keeps the plain word for every other stage', () => {
    expect(
      stageWords(stageView('c', { kind: 'director_check', status: 'skipped' })).label,
    ).toBe('No plan to check against');

    expect(
      stageWords(stageView('c', { kind: 'director_check', status: 'passed' })).label,
    ).toBe('Passed');

    expect(stageWords(stageView('a', { status: 'waiting' })).label).toBe(
      'Waiting for you',
    );
  });
});

describe('overrideLine and findStage', () => {
  it('says what the owner overruled and why', () => {
    expect(
      overrideLine({ by: 'owner', action: 'continue', comment: 'in scope', at: 't' }),
    ).toBe('Continued as is by you: in scope');
  });

  it('finds a member inside a group, and nothing for an unknown id', () => {
    const stages = [
      stageView('group', {
        kind: 'group',
        members: [stageView('inner', { label: 'Inner' })],
      }),
    ];

    expect(findStage(stages, 'inner')?.label).toBe('Inner');
    expect(findStage(stages, 'group')?.id).toBe('group');
    expect(findStage(stages, 'nope')).toBeUndefined();
  });
});

describe('row warnings in the editor', () => {
  const full = lane('full');
  const group = full.stages.find((s) => s.id === 'review-group')!;
  const note = 'Critique: the critic runs on the same model family as the Worker';

  it('files a warning on the group whose member it names, without the name', () => {
    expect(stageWarnings(group, [note])).toEqual([
      'the critic runs on the same model family as the Worker',
    ]);

    expect(stageWarnings(full.stages[0]!, [note])).toEqual([]);
  });

  it('leaves in the list only the warnings no row claims', () => {
    expect(listWarnings(full, [note, 'Something about the whole lane'])).toEqual([
      'Something about the whole lane',
    ]);
  });
});
