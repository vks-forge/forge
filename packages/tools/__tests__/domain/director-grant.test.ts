/**
 * Pins: the Director's planning reads go through admit() and reach only the project root.
 *
 * Why: the Director reads the repo (files, text search, path patterns) before it plans a
 *   card, and that is the one place a model-written path reaches the filesystem on the
 *   engine side with no Worker sandbox around it. If a path such as `../secret`, an
 *   absolute path outside the project, a credential file or a non-read tool were admitted,
 *   a planning prompt could leak or change files outside the project. These tests pin that
 *   only read, grep and glob inside the root are allowed, that every other tool and every
 *   odd input is denied, and that a wiring error denies instead of throwing.
 *
 * Pins: admitDirectorRead(), admitDirectorTool(), DIRECTOR_TOOL_IDS.
 * Depends on: domain/director-grant, fast-check, vitest. No IO.
 */

import type { ReadRequest } from '@forge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_TOOL_IDS,
  admitDirectorRead,
  admitDirectorTool,
} from '#/domain/director-grant.js';

const ROOT = '/work/repo';
const read = (path: string): ReadRequest => ({ op: 'read', path });
const verdict = (r: ReadRequest, root = ROOT) => admitDirectorRead(r, root).decision;

describe('director grant: what is allowed', () => {
  it('exposes exactly read, grep and glob', () => {
    expect(DIRECTOR_TOOL_IDS).toEqual(['read', 'grep', 'glob']);
  });

  it.each(['src/a.ts', 'docs/x.md', './src/a.ts', '/work/repo/src/a.ts', 'README.md'])(
    'allows reading %s',
    (p) => {
      expect(verdict(read(p))).toBe('allow');
    },
  );

  it('allows grep with and without a glob, and glob patterns', () => {
    expect(verdict({ op: 'grep', pattern: String.raw`foo\(bar\)` })).toBe('allow');
    expect(verdict({ op: 'grep', pattern: 'foo', glob: 'src/**/*.ts' })).toBe('allow');
    expect(verdict({ op: 'glob', pattern: 'src/**/*.ts' })).toBe('allow');
  });

  it('allows a Windows-style root and an absolute path inside it', () => {
    const root = String.raw`C:\work\repo`;

    expect(verdict(read(String.raw`C:\work\repo\src\a.ts`), root)).toBe('allow');
    expect(verdict(read(String.raw`src\a.ts`), root)).toBe('allow');
    expect(verdict(read(String.raw`C:\Windows\win.ini`), root)).toBe('deny');
  });

  it('allows a data home that is a parent of the root only inside the root', () => {
    const d = admitDirectorRead(
      read('src/a.ts'),
      '/home/u/.forge/wt/1',
      '/home/u/.forge',
    );

    expect(d.decision).toBe('allow');
  });
});

describe('director grant: what is denied', () => {
  it.each([
    '../secret',
    'src/../../x',
    String.raw`src/..\..\x`,
    '/etc/passwd',
    '/work/other/a.ts',
    String.raw`C:\Windows\win.ini`,
    'C:win.ini',
    String.raw`\\server\share\x`,
    '//server/share/x',
    '~/.ssh/id_rsa',
    '~',
    '.env',
    'app/.env.local',
    '',
    'src/a\u0000.ts',
    'src/a\n.ts',
  ])('denies reading %j', (p) => {
    expect(verdict(read(p))).toBe('deny');
  });

  it('denies a non-string path', () => {
    const bad = { op: 'read', path: 5 } as unknown as ReadRequest;

    expect(verdict(bad)).toBe('deny');
    expect(verdict({ op: 'bogus' } as unknown as ReadRequest)).toBe('deny');
    expect(verdict(null as unknown as ReadRequest)).toBe('deny');
  });

  it('denies glob and grep-glob patterns that climb out', () => {
    expect(verdict({ op: 'glob', pattern: '../**' })).toBe('deny');
    expect(verdict({ op: 'glob', pattern: 'src/../../**' })).toBe('deny');
    expect(verdict({ op: 'glob', pattern: '/etc/*' })).toBe('deny');
    expect(verdict({ op: 'grep', pattern: 'x', glob: '../**' })).toBe('deny');
    expect(verdict({ op: 'grep', pattern: '' })).toBe('deny');
    expect(verdict({ op: 'grep', pattern: 'a\u0000b' })).toBe('deny');
  });

  it('denies, never throws, when the root is not absolute', () => {
    expect(admitDirectorRead(read('src/a.ts'), 'relative/root').decision).toBe('deny');
    expect(admitDirectorRead(read('src/a.ts'), '').decision).toBe('deny');
    expect(
      admitDirectorRead(read('src/a.ts'), undefined as unknown as string).decision,
    ).toBe('deny');
  });

  it.each([
    'write',
    'edit',
    'shell',
    'web_fetch',
    'web_search',
    'mcp__forge__finish',
    'mcp__x__y',
    'nope',
    '',
    '*',
  ])('denies the tool %j', (tool) => {
    const d = admitDirectorTool(tool, { file_path: 'src/a.ts', command: 'ls' }, ROOT);

    expect(d.decision).toBe('deny');
  });

  it('reports a Decision for every denial', () => {
    const d = admitDirectorRead(read('../x'), ROOT);

    expect(d).toMatchObject({
      decision: 'deny',
      enforced_by: 'forge_admit',
      tool: 'read',
    });
  });
});

describe('director grant: what the floors say about project folders', () => {
  it('pins .git and .forge reads', () => {
    const git = verdict(read('.git/config'));
    const forge = verdict(read('.forge/memory/MEMORY.md'));

    expect([git, forge]).toEqual(['allow', 'allow']);
  });
});

describe('director grant: properties', () => {
  const name = fc.stringMatching(/^[a-z][a-z0-9_-]{0,8}$/);

  it('any path with a .. segment is denied', () => {
    fc.assert(
      fc.property(
        fc.array(name, { maxLength: 3 }),
        fc.array(name, { maxLength: 3 }),
        (a, b) => {
          const p = [...a, '..', ...b].join('/');

          expect(verdict(read(p))).toBe('deny');
          expect(verdict({ op: 'glob', pattern: p })).toBe('deny');
        },
      ),
    );
  });

  it('any src/<safe-name>.ts is allowed', () => {
    fc.assert(
      fc.property(name, (n) => {
        expect(verdict(read(`src/${n}.ts`))).toBe('allow');
      }),
    );
  });
});
