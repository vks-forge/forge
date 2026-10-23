/**
 * Conflict-marker check tests: unresolved merge markers never reach main.
 *
 * Why: when main moves under a ticket, Forge merges it in and may commit the clash with git's
 *   `<<<<<<<` markers inside the files so the ticket's writer can resolve it. A writer that stops
 *   early leaves those markers in the tree, and tests that never read the file would still pass.
 *   This check refuses any line the ticket adds that starts a marker, in any text file of any
 *   language, so the markers can never merge. It must not trip on a bare `=======` (common in
 *   docs and underlines) or on markers that already sit in the base.
 *
 * Pins: an added `<<<<<<< ` or `>>>>>>> ` line fails with the file named, `=======` alone passes,
 *   removed marker lines (the base's, being cleaned up) pass, binary files are skipped, and G1
 *   puts the failure on its verdict.
 * Depends on: domain/conflict-markers, domain/patch, adapters/g1-gate-factory, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { createG1Gate } from '#/adapters/g1-gate-factory.js';
import { checkConflictMarkers } from '#/domain/conflict-markers.js';
import { parsePatch } from '#/domain/patch.js';
import {
  SECRET,
  chain,
  checksOf,
  context,
  diffOf,
  patchFor,
  receiptLog,
} from '#tests/helpers/fixtures.js';

const check = (added: string[], removed: string[] = [], path = 'notes.txt') =>
  checkConflictMarkers(parsePatch(patchFor(path, added, removed)));

describe('checkConflictMarkers', () => {
  it('fails an added <<<<<<< line and names the file', () => {
    const out = check(['a', '<<<<<<< HEAD', 'b']);

    expect(out.status).toBe('failed');
    expect(out.name).toBe('conflict-markers');
    expect(out.findings).toEqual([
      expect.objectContaining({ check: 'conflict-markers', file: 'notes.txt' }),
    ]);
  });

  it('fails an added >>>>>>> line', () => {
    expect(check(['>>>>>>> feat/SF-2-x']).status).toBe('failed');
  });

  it('passes a bare ======= line', () => {
    expect(check(['Title', '=======']).status).toBe('passed');
  });

  it('ignores marker lines that were removed (the base had them already)', () => {
    expect(check(['fixed'], ['<<<<<<< HEAD', '=======', '>>>>>>> x']).status).toBe(
      'passed',
    );
  });

  it('passes a line that merely contains seven angle brackets inside text', () => {
    expect(check(['see <<<<<<< in the docs']).status).toBe('passed');
  });

  it('reports each file once', () => {
    const out = checkConflictMarkers([
      ...parsePatch(patchFor('a.txt', ['<<<<<<< HEAD', '>>>>>>> x'])),
      ...parsePatch(patchFor('b.py', ['<<<<<<< HEAD'])),
    ]);

    expect(out.findings.map((f) => f.file)).toEqual(['a.txt', 'b.py']);
  });
});

describe('G1 with conflict markers', () => {
  it('fails the verdict when the ticket adds a marker line', async () => {
    const patch = patchFor('notes.txt', ['<<<<<<< HEAD']);
    const gate = createG1Gate({
      receipts: receiptLog(chain([])),
      worktrees: {
        diff: () => Promise.resolve(diffOf([{ status: 'M', path: 'notes.txt' }], patch)),
      },
      listToolCalls: () => Promise.resolve([]),
      runSecrets: () => Promise.resolve(SECRET),
      env: {},
      runCommand: () => Promise.resolve({ exitCode: 0, timedOut: false, output: '' }),
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const verdict = await gate.run(context({ claims: [], checks: checksOf({}) }));

    expect(verdict.status).toBe('failed');
    expect(verdict.findings.some((f) => f.check === 'conflict-markers')).toBe(true);
  });
});
