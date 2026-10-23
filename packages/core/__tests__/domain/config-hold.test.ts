/**
 * Pins when a failed G1 counts as "gate configuration only".
 *
 * Why: that one answer decides whether the owner sees a Merge anyway card at once or the ticket
 *   burns two reworks that cannot change anything. Saying yes wrongly would let a real failure
 *   (a false claim, a failing test) be overruled from a card that calls it a config change, so
 *   every doubt must say no and take the ordinary road (d-0173).
 *
 * Pins: a failed verdict marked config-only with only gate-config findings gives its files; any other
 *   check's finding, a missing marker, a non-failed status, a missing verdict or no verdicts at
 *   all give null; files are listed once; a finding without a file names package.json; the
 *   summary names the files and the two choices.
 * Depends on: src/domain/config-hold, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { configHoldSummary, configOnlyFiles } from '#/domain/config-hold.js';
import type { GateVerdict } from '#/types/ports/gate.types.js';

const verdict = (over: Partial<GateVerdict> = {}): GateVerdict => ({
  status: 'failed',
  configOnly: true,
  findings: [{ check: 'gate-config', file: 'vitest.config.ts', message: 'm' }],
  report: 'r',
  ...over,
});

describe('configOnlyFiles', () => {
  it('lists the files of a config-only failure, once each', () => {
    const v = verdict({
      findings: [
        { check: 'gate-config', file: 'tsconfig.json', message: 'a' },
        { check: 'gate-config', file: 'tsconfig.json', message: 'b' },
        { check: 'gate-config', message: 'script' },
      ],
    });

    expect(configOnlyFiles([v])).toEqual(['tsconfig.json', 'package.json']);
  });

  it.each([
    [
      'another check also failed',
      verdict({
        findings: [
          { check: 'claims', message: 'x' },
          { check: 'gate-config', file: 'a', message: 'y' },
        ],
      }),
    ],
    ['the marker is absent', verdict({ configOnly: false })],
    ['the status is error', verdict({ status: 'error' })],
    ['the status is passed', verdict({ status: 'passed' })],
    ['there are no findings', verdict({ findings: [] })],
  ])('is null when %s', (_name, v) => {
    expect(configOnlyFiles([v])).toBeNull();
  });

  it('is null with no verdicts, or when any failed gate has no verdict (lost in a restart)', () => {
    expect(configOnlyFiles([])).toBeNull();
    expect(configOnlyFiles([verdict(), undefined])).toBeNull();
  });

  it('is null whenever any finding is from another check', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((c) => c !== 'gate-config'),
        fc.nat(3),
        (check, at) => {
          const findings = Array.from({ length: 4 }, () => ({
            check: 'gate-config',
            file: 'x.json',
            message: 'm',
          }));

          findings[at] = { check, file: 'x.json', message: 'm' };

          expect(configOnlyFiles([verdict({ findings })])).toBeNull();
        },
      ),
    );
  });
});

describe('configHoldSummary', () => {
  it('names the files and the two choices the owner has', () => {
    const text = configHoldSummary(['tsconfig.json', 'vitest.config.ts']);

    expect(text).toContain('tsconfig.json, vitest.config.ts');
    expect(text).toContain('control how its work is checked');
    expect(text).toContain('review them, then Merge anyway or send it back');
  });

  it('shortens a long list', () => {
    const files = Array.from({ length: 13 }, (_, i) => `c${i}.json`);

    expect(configHoldSummary(files)).toContain('and 3 more');
  });
});
