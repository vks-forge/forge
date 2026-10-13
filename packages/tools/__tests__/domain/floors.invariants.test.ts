/**
 * Pins the path floors as an invariant: every spelling of a floored path is denied for
 * every path-reading and path-writing tool in every lane, and no malformed input shape
 * ever turns a path tool into an allow.
 *
 * Why: the floors protect Forge's database and run secrets, credential files and the
 * harness's own user config. A Worker controls the spelling (relative, absolute, `..`,
 * UNC, `\\?\`, upper case, either slash) and the tool (`read`, `grep`, `glob`, `edit`,
 * `write`) and the field it puts the path in. One missed combination is a read of
 * `forge.db` or `.claude.json`. This table is the regression net: add a spelling here
 * before adding a fix. The property test covers the other side: a call with no usable
 * string resource must never be admitted.
 *
 * Pins: evaluateToolRules() and admit() on the path actions, FLOOR_RULES.
 * Depends on: domain/rules, domain/admit, domain/grants, helpers/fixtures, fast-check, vitest. No IO.
 */

import type { Lane } from '@forge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateToolRules } from '#/domain/rules.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const LANES: readonly Lane[] = ['express', 'standard', 'full'];
const ALL_ACTIONS = ['read', 'grep', 'glob', 'edit', 'write'] as const;
const READ_ACTIONS = ['read', 'grep', 'glob'] as const;

/** A Worker cwd under the main checkout, as the engine creates it. */
const WIN_CWD = 'C:/work/repo/.worktrees/t1';
const POSIX_CWD = '/work/repo/.worktrees/t1';

const FORGE_DATA = [
  'C:/work/repo/.forge/data/forge.db',
  'C:\\work\\repo\\.forge\\data\\forge.db',
  '../../.forge/data/forge.db',
  '..\\..\\.forge\\data\\forge.db',
  '..\\..\\.forge\\data',
  'C:/WORK/REPO/.FORGE/DATA/forge.db',
  '\\\\?\\C:\\work\\repo\\.forge\\data\\forge.db',
  '//?/C:/work/repo/.forge/data/x',
  '\\\\.\\C:\\work\\repo\\.forge\\data\\x',
  '.forge/data',
  '.forge/data/',
  '.FORGE/data/x',
  './.forge/./data/../data/x',
  'sub/.forge/data/x',
  'C:/work/repo/.worktrees/t1/.forge/data/x',
  'C:/work/repo/.worktrees/t1/.Forge/Data',
  '.forge/data.',
  '.forge/data /x',
  '.forge/data::$DATA',
];

const CREDENTIALS = [
  '.env',
  '.ENV',
  './.env',
  'src/.env',
  'C:/work/repo/.worktrees/t1/.env',
  'C:\\work\\repo\\.worktrees\\t1\\.ENV',
  '.env.',
  '.env ',
  '.env::$DATA',
  '.env.local',
  '.ssh',
  '.ssh/id_rsa',
  '~/.ssh/id_rsa',
  'C:/Users/x/.ssh/id_rsa',
  'server.PEM',
  'a/id_ed25519.pub',
  '.npmrc',
  'x/.aws/credentials',
];

const OUTSIDE = [
  '..',
  '../x',
  '..\\x',
  'src/../../x',
  'C:/Windows/System32/x.dll',
  'D:\\other\\x',
  'C:',
  'C:x',
  '//server/share/x',
  '\\\\server\\share\\x',
  '\\\\?\\UNC\\server\\share\\x',
  '/etc/passwd',
  '~/notes.txt',
];

const HARNESS_CONFIG = [
  'C:/Users/x/.claude.json',
  'C:\\Users\\x\\.CLAUDE.JSON',
  '.claude.json',
  '.claude/settings.json',
  '.claude',
  'C:/Users/x/.claude/projects/a.jsonl',
  '.codex/config.toml',
  '.codex',
  'C:/Users/x/.codex/auth.json',
];

const outcome = (
  lane: Lane,
  action: string,
  path: string,
  cwd: string,
): { effect: string; reason: string } =>
  evaluateToolRules(effectiveGrant(lane), action, path, cwd);

describe.each([
  ['windows cwd', WIN_CWD],
  ['posix cwd', POSIX_CWD],
])('floored spellings are denied (%s)', (_name, cwd) => {
  const posix = cwd.startsWith('/');
  /** Windows-only spellings on a posix host are ordinary relative names, not floored. */
  const applicable = (p: string): boolean =>
    !posix || (!/[A-Za-z]:|\\|\/\/[?.]\//.test(p) && !p.includes('::'));

  describe.each([
    ['forge data', FORGE_DATA, ALL_ACTIONS],
    ['credentials', CREDENTIALS, ALL_ACTIONS],
    ['outside the worktree', OUTSIDE, ALL_ACTIONS],
    ['harness user config', HARNESS_CONFIG, READ_ACTIONS],
  ] as const)('%s', (_label, paths, actions) => {
    for (const lane of LANES) {
      for (const action of actions) {
        it.each(paths.filter(applicable))(`${lane} ${action} %j`, (p) => {
          const o = outcome(lane, action, p, cwd);
          expect(o.effect).toBe('deny');
          expect(o.reason).toBe('managed_deny');
        });
      }
    }
  });

  it.each(LANES.flatMap((l) => READ_ACTIONS.map((a) => [l, a] as const)))(
    '%s %s with an empty resource is denied',
    (lane, action) => {
      expect(outcome(lane, action, '', cwd).effect).toBe('deny');
      expect(outcome(lane, action, '   ', cwd).effect).toBe('deny');
    },
  );
});

describe('ordinary paths inside the worktree still work', () => {
  it.each([
    ['read', 'src/a.ts'],
    ['read', '.env.example'],
    ['grep', 'src'],
    ['glob', 'src/**/*.ts'],
    ['read', 'C:/work/repo/.worktrees/t1/src/A.ts'],
    ['edit', 'docs/x.md'],
  ])('%s %s is allowed', (action, p) => {
    expect(outcome('standard', action, p, WIN_CWD).effect).toBe('allow');
  });
});

describe('admit() applies the floors through every input field', () => {
  const field = (action: string): string =>
    action === 'grep' || action === 'glob' ? 'path' : 'file_path';

  const tool = (action: string): string => action;

  it.each(
    LANES.flatMap((l) =>
      ALL_ACTIONS.flatMap((a) =>
        [...FORGE_DATA.slice(0, 6), ...CREDENTIALS.slice(0, 4)].map(
          (p) => [l, a, p] as const,
        ),
      ),
    ),
  )('%s %s %j is denied', (lane, action, p) => {
    const ctx = makeCtx(lane, { cwd: WIN_CWD });
    const d = admit(ctx, call(tool(action), { [field(action)]: p }));
    expect(d.decision).toBe('deny');
  });

  it('judges both path and pattern of a glob', () => {
    const ctx = makeCtx('express', { cwd: WIN_CWD });
    const d = admit(ctx, call('glob', { path: '.', pattern: '../../.forge/data/*' }));
    expect(d.decision).toBe('deny');
  });

  it('judges the pattern of a grep with no path', () => {
    const ctx = makeCtx('express', { cwd: WIN_CWD });
    expect(admit(ctx, call('grep', { pattern: '.forge/data' })).decision).toBe('deny');
    expect(admit(ctx, call('grep', { pattern: '.env' })).decision).toBe('deny');
  });

  it('judges every path field when several are present', () => {
    const ctx = makeCtx('express', { cwd: WIN_CWD });
    const d = admit(ctx, call('read', { file_path: 'src/a.ts', path: '.env' }));
    expect(d.decision).toBe('deny');
  });
});

describe('a path tool without a usable string resource is never admitted', () => {
  const resourceKeys = ['file_path', 'path', 'notebook_path', 'pattern'] as const;
  const tools = ['read', 'edit', 'write', 'grep', 'glob'] as const;

  it.each(LANES.flatMap((l) => tools.map((t) => [l, t] as const)))(
    '%s %s: missing, empty and non-string resources deny',
    (lane, name) => {
      const ctx = makeCtx(lane);
      for (const input of [
        undefined,
        {},
        { file_path: '' },
        { path: '' },
        { pattern: '' },
        { file_path: 7 },
        { file_path: ['a'] },
        { path: null, pattern: null },
        { file_path: { toString: 'x' } },
        { other: 'src/a.ts' },
      ]) {
        const d = admit(ctx, call(name, input as Record<string, unknown> | undefined));
        expect(d.decision, JSON.stringify(input)).toBe('deny');
      }
    },
  );

  it('property: allow implies every resource field is a string and one is non-empty', () => {
    const value = fc.oneof(
      fc.string(),
      fc.constant(''),
      fc.constant(null),
      fc.integer(),
      fc.array(fc.string(), { maxLength: 2 }),
      fc.object({ maxDepth: 1 }),
    );

    const shape = fc.record(
      {
        file_path: value,
        path: value,
        notebook_path: value,
        pattern: value,
        other: value,
      },
      { requiredKeys: [] },
    );

    for (const lane of LANES) {
      const ctx = makeCtx(lane);
      fc.assert(
        fc.property(fc.constantFrom(...tools), shape, (name, input) => {
          const d = admit(ctx, call(name, input));
          if (d.decision !== 'allow') {
            return true;
          }

          const present = resourceKeys.filter(
            (k) => input[k] !== undefined && input[k] !== null,
          );

          const strings = present.filter((k) => typeof input[k] === 'string');
          const usable = strings.some((k) => (input[k] as string).trim() !== '');

          return strings.length === present.length && usable;
        }),
        { numRuns: 400 },
      );
    }
  });
});
