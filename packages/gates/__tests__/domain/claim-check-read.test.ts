/**
 * Read-claim evidence tests — pin which receipts back a `read P` claim.
 *
 * Why: Workers read by searching as often as by opening a file (`grep` over `src`), and the
 *   eval failed G1 on honest reads because only a `read` call on the exact path counted. If a
 *   search over a sibling folder or a failed call also counted, a read claim would pass on
 *   evidence that never reached the file.
 *
 * Pins: folder, dot and worktree-root searches back a read; earlier verified runs count;
 *   sibling folders, prefix folders, failed_no_effect and edited claims do not.
 * Depends on: domain/claim-check, helpers/fixtures.
 */

import type { Claim, WorktreeDiffFile } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { checkClaims } from '#/domain/claim-check.js';
import { chain, diffOf } from '#tests/helpers/fixtures.js';

const WT = 'D:/work/wt';

function run(
  claims: Claim[],
  calls: Parameters<typeof chain>[0],
  files: WorktreeDiffFile[] = [],
) {
  return checkClaims(claims, {
    receipts: chain(calls),
    diff: diffOf(files),
    patch: [],
    testCommands: [],
    worktreePath: WT,
  });
}

describe('checkClaims read evidence', () => {
  it('backs a read of a file by a completed read-risk call over its folder (FR-14 34aed0)', () => {
    const out = run(
      [{ kind: 'read', path: 'test/cli.test.ts' }],
      [{ id: 'g', tool: 'grep', resource: 'test', state: 'read_completed' }],
    );

    expect(out.status).toBe('passed');
    expect(out.details).toContain('backed by a search over test');
  });

  it('backs a read by a search over the worktree root or dot', () => {
    const dot = run(
      [{ kind: 'read', path: 'src/a.ts' }],
      [{ id: 'g', tool: 'grep', resource: '.', state: 'read_completed' }],
    );

    const root = run(
      [{ kind: 'read', path: 'src/a.ts' }],
      [{ id: 'g', tool: 'glob', resource: 'D:\\Work\\wt', state: 'read_completed' }],
    );

    expect(dot.status).toBe('passed');
    expect(root.status).toBe('passed');
  });

  it('backs a read from an earlier verified run search of the exact file (FR-15 09605d)', () => {
    const out = checkClaims([{ kind: 'read', path: 'src/store.ts' }], {
      receipts: chain([]),
      earlierRuns: [
        {
          runId: 'earlier',
          receipts: chain([
            { id: 'e1', tool: 'grep', resource: 'src/store.ts', state: 'read_completed' },
          ]),
        },
      ],
      diff: diffOf([]),
      patch: [],
      testCommands: [],
      worktreePath: WT,
    });

    expect(out.status).toBe('passed');
  });

  it('does not back a read by a search over a sibling folder or a longer prefix', () => {
    const sibling = run(
      [{ kind: 'read', path: 'test/a.ts' }],
      [{ id: 'g', tool: 'grep', resource: 'src', state: 'read_completed' }],
    );

    const prefix = run(
      [{ kind: 'read', path: 'srcs/a.ts' }],
      [{ id: 'g', tool: 'grep', resource: 'src', state: 'read_completed' }],
    );

    expect(sibling.status).toBe('failed');
    expect(prefix.status).toBe('failed');
  });

  it('never backs a read with a failed_no_effect call', () => {
    const out = run(
      [{ kind: 'read', path: 'test/a.ts' }],
      [{ id: 'g', tool: 'grep', resource: 'test', state: 'failed_no_effect' }],
    );

    expect(out.status).toBe('failed');
  });

  it('does not let a grep-only path back an edited claim', () => {
    const out = run(
      [{ kind: 'edited', path: 'src/a.ts' }],
      [{ id: 'g', tool: 'grep', resource: 'src', state: 'read_completed' }],
      [{ status: 'M', path: 'src/a.ts' }],
    );

    expect(out.status).toBe('failed');
  });
});
