/**
 * Pins: applying the owner's verdict on a finding to a ticket strip for the optimistic update: only
 * the marked stage row changes (a group member too), a second mark replaces the first, a null clears
 * it, marks stay sorted by position, and the view the cache held is never edited in place.
 *
 * Why: the toggle shows the verdict before the server answers and puts the old view back on a
 * refusal. If the update touched another row, edited the cached view in place or lost an earlier mark,
 * either the screen would lie about the owner's verdicts or the rollback would restore the wrong state.
 * Depends on: domain/finding-marks, helpers/forge-data/pipeline-data.
 */

import { describe, expect, it } from 'vitest';
import { VERDICT_LABEL, verdictAt, withMark } from '#/domain/finding-marks.js';
import { stageView, ticketPipeline } from '#tests/helpers/forge-data/pipeline-data.js';

const view = () =>
  ticketPipeline([
    stageView('reviewer', { row_id: 7, marks: [{ index: 0, verdict: 'real' }] }),
    stageView('group', {
      kind: 'group',
      members: [stageView('critic', { row_id: 9 })],
    }),
    stageView('merge', { kind: 'merge' }),
  ]);

describe('withMark', () => {
  it('marks the finding on the row, keeping the marks already there in order', () => {
    const next = withMark(view(), 7, 2, 'false_alarm');

    expect(next.stages[0]?.marks).toEqual([
      { index: 0, verdict: 'real' },
      { index: 2, verdict: 'false_alarm' },
    ]);
  });

  it('replaces the verdict on a finding that already has one', () => {
    const next = withMark(view(), 7, 0, 'false_alarm');

    expect(next.stages[0]?.marks).toEqual([{ index: 0, verdict: 'false_alarm' }]);
  });

  it('clears a mark with null, leaving an empty list', () => {
    const next = withMark(view(), 7, 0, null);

    expect(next.stages[0]?.marks).toEqual([]);
  });

  it('marks a row inside a group', () => {
    const next = withMark(view(), 9, 1, 'real');

    expect(next.stages[1]?.members?.[0]?.marks).toEqual([{ index: 1, verdict: 'real' }]);
    expect(next.stages[1]?.marks).toBeUndefined();
  });

  it('leaves other rows alone and does not edit the view it was given', () => {
    const before = view();
    const snapshot = structuredClone(before);
    const next = withMark(before, 7, 3, 'real');

    expect(before).toEqual(snapshot);
    expect(next.stages[2]).toBe(before.stages[2]);
  });

  it('changes nothing when no row has that id', () => {
    expect(withMark(view(), 99, 0, 'real').stages[0]?.marks).toEqual([
      { index: 0, verdict: 'real' },
    ]);
  });
});

describe('verdictAt', () => {
  it('reads the verdict by position, or nothing', () => {
    const marks = [{ index: 1, verdict: 'false_alarm' as const }];

    expect(verdictAt(marks, 1)).toBe('false_alarm');
    expect(verdictAt(marks, 0)).toBeUndefined();
    expect(verdictAt(undefined, 0)).toBeUndefined();
  });

  it('has the owner’s words for both verdicts', () => {
    expect(VERDICT_LABEL).toEqual({ real: 'Real', false_alarm: 'False alarm' });
  });
});
