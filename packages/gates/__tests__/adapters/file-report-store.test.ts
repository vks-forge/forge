/**
 * Pins: where gate reports land and that they are never lost or escaped.
 *
 * Why: a `gate_results` row points at its report by a relative reference, and the Ticket
 * screen shows that file as the evidence for a pass or a rework. The reference must be
 * predictable, a second report with the same name must not replace the first (the row
 * still points at it), a crash must not leave a half-written file under the final name,
 * and a run id or report name must not be able to write outside the run's folder.
 *
 * Depends on: src/adapters/file-report-store. IO: temp directory.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileReportStore } from '#/adapters/file-report-store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'forge-reports-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createFileReportStore', () => {
  it('writes <runId>/gates/<name>.md and returns the relative reference', async () => {
    const store = createFileReportStore(dir);
    const ref = await store.put('run-1', 'G1-abc123.txt', '# report');

    expect(ref).toBe('runs/run-1/gates/G1-abc123.md');
    expect(
      readFileSync(join(dir, 'runs', 'run-1', 'gates', 'G1-abc123.md'), 'utf8'),
    ).toBe('# report');

    expect(readdirSync(join(dir, 'runs', 'run-1', 'gates'))).toEqual(['G1-abc123.md']);
  });

  it('keeps an earlier report of the same name and stores the new one beside it', async () => {
    const store = createFileReportStore(dir);
    const first = await store.put('run-1', 'G1-abc', 'old');
    const second = await store.put('run-1', 'G1-abc', 'new');
    const third = await store.put('run-1', 'G1-abc', 'newer');

    expect([first, second, third]).toEqual([
      'runs/run-1/gates/G1-abc.md',
      'runs/run-1/gates/G1-abc-2.md',
      'runs/run-1/gates/G1-abc-3.md',
    ]);

    const read = (ref: string): string =>
      readFileSync(join(dir, ...ref.split('/')), 'utf8');

    expect([read(first), read(second), read(third)]).toEqual(['old', 'new', 'newer']);
    expect(readdirSync(join(dir, 'runs', 'run-1', 'gates')).sort()).toEqual([
      'G1-abc-2.md',
      'G1-abc-3.md',
      'G1-abc.md',
    ]);
  });

  it.each([
    ['../escape', 'G1'],
    ['run-1', '../G1'],
    ['run-1', 'a/b'],
    ['run-1', ''],
    ['', 'G1'],
    ['run-1', '..'],
  ])('refuses the unsafe run %j / name %j', async (runId, name) => {
    await expect(createFileReportStore(dir).put(runId, name, 'x')).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });
});
