/**
 * Tests for the check, review, sign-off and merge entries of buildHistory.
 *
 * Why: "why was it sent back?" and "who signed this?" are the questions the owner asks most. The
 *   entries must carry the reviewer's own finding, the failed gates by name and the signer, or the
 *   History tab says "Done" without saying who let it through.
 *
 * Pins: a review that sent work back titles itself with its first finding and links its stage and
 *   run; failed gates are named for runs no stage covers; the merge line names who signed; a merge
 *   with no stored sign-off says only "Merged and done".
 * Depends on: src/domain/history-build, helpers/history-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { buildHistory } from '#/domain/history-build.js';
import { at, ev, facts, stage } from '#tests/helpers/history-fixtures.js';

const state = (sec: number, from: string, to: string, reason?: string) =>
  ev(sec, 'ticket_state', {
    ticket_id: 'CHE-1',
    from,
    to,
    ...(reason ? { reason } : {}),
  });

describe('buildHistory checks and merge', () => {
  it('titles a review that sent the work back with its first finding', () => {
    const [entry] = buildHistory(
      facts({
        stageRuns: [
          stage({
            status: 'failed',
            ended_at: at(50),
            run_id: 'r1',
            outcome: {
              review: {
                verdict: 'changes',
                summary: 'Two problems.',
                findings: [
                  {
                    severity: 'high',
                    issue: 'zod is missing from package.json',
                    evidence: 'x',
                  },
                ],
              },
            },
          }),
        ],
      }),
    );

    expect(entry).toMatchObject({
      kind: 'check',
      title: 'Sent back: zod is missing from package.json',
      detail: 'Two problems.',
      links: { stage_id: 'review', run_id: 'r1' },
    });
  });

  it('names the failed gates of a run no stage covers', () => {
    const [entry] = buildHistory(
      facts({
        gates: [
          {
            id: 1,
            run_id: 'r1',
            gate: 'G2',
            status: 'failed',
            started_at: at(1),
            ended_at: at(2),
          },
          {
            id: 2,
            run_id: 'r1',
            gate: 'G3',
            status: 'passed',
            started_at: at(1),
            ended_at: at(3),
          },
        ],
      }),
    );

    expect(entry?.title).toBe('Checks failed: G2');
  });

  it.each([
    ['owner', 'Signed off by you and merged'],
    ['director', 'Signed off by the Director and merged'],
  ])('words the merge by who signed (%s)', (signer, title) => {
    const entries = buildHistory(
      facts({
        events: [state(100, 'needs_signoff', 'done')],
        stageRuns: [
          stage({
            kind: 'human',
            ended_at: at(99),
            outcome: { signed_by: signer as 'owner' },
          }),
        ],
      }),
    );

    expect(entries.find((e) => e.kind === 'merge')?.title).toBe(title);
  });

  it('says merged and done when no sign-off is stored', () => {
    const [entry] = buildHistory(facts({ events: [state(0, 'verifying', 'done')] }));

    expect(entry).toMatchObject({ kind: 'merge', title: 'Merged and done' });
  });
});
