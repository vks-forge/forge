/**
 * Pins when a failed G1 counts as "the proof of an earlier run is gone, nothing else is wrong".
 *
 * Why: that answer decides whether the owner gets a Merge anyway card (after the automatic
 *   rework that re-applies the files is spent) or the ticket dead-ends at the rework cap with
 *   no way to settle it. Saying yes wrongly would let a real failure (a false claim, a failing
 *   test, a forged chain) be overruled from a card that calls it a lost-proof problem, so every
 *   doubt must say no and take the ordinary road (F-D3, same rule as config holds, d-0173).
 *
 * Pins: a failed verdict marked provenance-only whose findings are all claims findings with a
 *   file gives those files once each; a missing marker, another check's finding, a finding with
 *   no file, a non-failed status, a missing verdict or no verdicts at all give null; the summary
 *   names the files and the choices.
 * Depends on: src/domain/provenance-hold, vitest.
 */

import { describe, expect, it } from 'vitest';
import { provenanceHoldSummary, provenanceOnlyFiles } from '#/domain/provenance-hold.js';
import type { GateVerdict } from '#/types/ports/gate.types.js';

const verdict = (over: Partial<GateVerdict> = {}): GateVerdict => ({
  status: 'failed',
  provenanceOnly: true,
  findings: [{ check: 'claims', file: 'src/cli.ts', message: 'm' }],
  report: 'r',
  ...over,
});

describe('provenanceOnlyFiles', () => {
  it('lists the files of a provenance-only failure, once each', () => {
    const v = verdict({
      findings: [
        { check: 'claims', file: 'src/cli.ts', message: 'a' },
        { check: 'claims', file: 'src/cli.ts', message: 'b' },
        { check: 'claims', file: 'src/store.ts', message: 'c' },
      ],
    });

    expect(provenanceOnlyFiles([v])).toEqual(['src/cli.ts', 'src/store.ts']);
  });

  it.each([
    [
      'no marker',
      {
        status: 'failed',
        findings: [{ check: 'claims', file: 'a', message: 'x' }],
        report: 'r',
      },
    ],
    ['marker false', verdict({ provenanceOnly: false })],
    [
      'another check finding',
      verdict({ findings: [{ check: 'tests', file: 'a', message: 'x' }] }),
    ],
    [
      'a finding with no file',
      verdict({ findings: [{ check: 'claims', message: 'x' }] }),
    ],
    ['no findings', verdict({ findings: [] })],
    ['a passed status', verdict({ status: 'passed' })],
    ['an error status', verdict({ status: 'error' })],
    ['a missing verdict', undefined],
  ] as readonly (readonly [string, GateVerdict | undefined])[])(
    'is null for %s',
    (_name, v) => {
      expect(provenanceOnlyFiles([v])).toBeNull();
    },
  );

  it('is null for no verdicts and when any one verdict is not provenance-only', () => {
    expect(provenanceOnlyFiles([])).toBeNull();
    expect(
      provenanceOnlyFiles([verdict(), verdict({ provenanceOnly: false })]),
    ).toBeNull();
  });
});

describe('provenanceHoldSummary', () => {
  it('names the files and says the owner can merge anyway or send it back', () => {
    const text = provenanceHoldSummary(['src/cli.ts', 'src/store.ts']);

    expect(text).toContain('src/cli.ts, src/store.ts');
    expect(text).toContain('Merge anyway');
  });

  it('shortens a long list', () => {
    const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`);

    expect(provenanceHoldSummary(files)).toContain('and 2 more');
  });
});
