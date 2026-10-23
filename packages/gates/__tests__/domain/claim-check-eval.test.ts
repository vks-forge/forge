/**
 * Claim matcher against the eval's real claim list — FR-2 run ceb149.
 *
 * Why: the eval failed G1 on claims the Worker stated truthfully: seven suite-qualified
 *   `added_test` names (`shelf add rejects ...`) that the declaration lines only carry as
 *   `it("rejects ...")`, and reads that a search covered. Rebuilding that claim list with
 *   receipts and a patch shaped like the eval rows (Windows absolute paths) pins that an honest
 *   run of this shape passes claims and stays passing.
 *
 * Pins: describe-qualified added_test names, edited with Windows absolute receipt paths, read
 *   backed by a folder search.
 * Depends on: domain/claim-check, domain/patch, helpers/fixtures.
 */

import type { Claim } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { checkClaims } from '#/domain/claim-check.js';
import { parsePatch } from '#/domain/patch.js';
import { chain, diffOf, patchFor } from '#tests/helpers/fixtures.js';

const WT = 'C:\\Users\\dev\\AppData\\Local\\Forge\\worktrees\\FR-2';
const TITLES = [
  'rejects an empty title',
  'rejects a whitespace-only title',
  'rejects a title over 200 characters',
  'rejects a duplicate title',
  'rejects an unknown flag',
  'rejects a missing store file',
  'rejects a corrupt store file',
];

describe('checkClaims on the FR-2 ceb149 shape', () => {
  it('passes the full claim list', () => {
    const patch =
      patchFor('test/cli.test.ts', [
        'describe("shelf add", () => {',
        ...TITLES.map((t) => `  it("${t}", () => {`),
      ]) + patchFor('src/cli.ts', ['export function add() {}']);

    const claims: Claim[] = [
      { kind: 'edited', path: 'src\\cli.ts' },
      { kind: 'edited', path: 'test\\cli.test.ts' },
      { kind: 'read', path: 'package.json' },
      { kind: 'ran_tests' },
      ...TITLES.map((t): Claim => ({ kind: 'added_test', name: `shelf add ${t}` })),
    ];

    const out = checkClaims(claims, {
      receipts: chain([
        { id: 'a', tool: 'edit', resource: `${WT}\\src\\cli.ts` },
        { id: 'b', tool: 'write', resource: `${WT}\\test\\cli.test.ts` },
        { id: 'c', tool: 'grep', resource: WT, state: 'read_completed' },
        { id: 'd', tool: 'shell', resource: 'pnpm test' },
      ]),
      diff: diffOf(
        [
          { status: 'M', path: 'src/cli.ts' },
          { status: 'A', path: 'test/cli.test.ts' },
        ],
        patch,
      ),
      patch: parsePatch(patch),
      testCommands: ['pnpm test'],
      worktreePath: WT,
    });

    expect(out.findings).toEqual([]);
    expect(out.status).toBe('passed');
  });
});
