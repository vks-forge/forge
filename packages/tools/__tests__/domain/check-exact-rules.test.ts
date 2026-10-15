/**
 * Pins: a project check led by an interpreter runs unattended only as its exact text.
 *
 * Why: Express has nobody to answer an `ask`, so a project whose checks are `node
 *   scripts/lint.mjs` or `python -m pytest` could never verify its own work, yet allowing
 *   `node*` would allow `node -e "<anything>"`. The lane therefore gets one allow rule per
 *   such check that matches the whole segment word for word, from the directory the check is
 *   configured to run in, with nothing around it: no assignment (`NODE_OPTIONS=...`), no
 *   redirect, no pipe, no expansion, no extra argument. Anything else stays an `ask`, which
 *   is a denial on Express.
 *
 * Pins: effectiveGrant() with shell input and evaluateShell() on Express, Standard and Full.
 * Depends on: domain/grants, domain/rules, domain/tokenizer, schemas/grant, vitest. No IO.
 */

import type { Lane } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  assertNotBannedAlwaysAllow,
  effectiveGrant,
  parseGrant,
} from '#/domain/grants.js';
import { evaluateShell } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import type { ShellAllowInput } from '#/types/shell-allowlist.types.js';

const ROOT = '/work/repo';

const input = (
  checks: readonly { command: string; cwd?: string }[],
): ShellAllowInput => ({
  commands: checks.map((c) => c.command),
  ecosystems: ['node'],
  checks,
  runCwd: ROOT,
});

function verdict(
  lane: Lane,
  shell: ShellAllowInput,
  command: string,
  opts: { dialect?: 'bash' | 'powershell'; cwd?: string } = {},
) {
  const dialect = opts.dialect ?? 'bash';
  const t = tokenizeShell(command, dialect);
  if (!t.ok) {
    throw new Error(t.error);
  }

  const grant = effectiveGrant(
    lane,
    undefined,
    undefined,
    [],
    { dataHome: '/forge-home' },
    shell,
  );

  return evaluateShell(grant, t.value, dialect, opts.cwd ?? ROOT);
}

const LINT = input([{ command: 'node scripts/lint.mjs' }]);
const allowed = (shell: ShellAllowInput, cmd: string, o = {}) =>
  verdict('express', shell, cmd, o).effect === 'allow';

describe('an interpreter-led check is allowed on Express as its exact text', () => {
  it('allows the configured command and names the rule', () => {
    const r = verdict('express', LINT, 'node scripts/lint.mjs');

    expect(r.effect).toBe('allow');
    expect(r.rule).toMatch(/^check:exact/);
  });

  it.each([
    'node scripts/lint.mjs -e x',
    'node scripts/lint.mjs --fix',
    'node scripts/lint.mjs; rm x',
    'node scripts/lint.mjs && rm x',
    'node scripts/other.mjs',
    'node scripts/lint.mjs.bak',
    'node -e "process.exit(0)"',
    'node',
    'npx eslint',
    'FOO=1 node scripts/lint.mjs',
    'NODE_OPTIONS=--require=./evil.js node scripts/lint.mjs',
    'node scripts/lint.mjs > out.txt',
    'echo hi | node scripts/lint.mjs',
    'node scripts/$X.mjs',
    'node scripts/lint.mjs $(echo)',
    'env node scripts/lint.mjs',
    '/usr/bin/node scripts/lint.mjs',
    'node scripts/lint.mjs &',
    'node Scripts/Lint.mjs',
    'NODE scripts/lint.mjs',
  ])('%s is not allowed', (cmd) => {
    expect(allowed(LINT, cmd)).toBe(false);
  });

  it('matches case-insensitively only for PowerShell', () => {
    expect(allowed(LINT, 'NODE Scripts/LINT.mjs', { dialect: 'powershell' })).toBe(true);
    expect(allowed(LINT, 'NODE Scripts/LINT.mjs')).toBe(false);
    expect(allowed(LINT, 'node scripts/lint.mjs extra', { dialect: 'powershell' })).toBe(
      false,
    );
  });

  it('collapses whitespace and quoting before comparing', () => {
    expect(allowed(LINT, 'node   scripts/lint.mjs')).toBe(true);
    expect(allowed(LINT, 'node "scripts/lint.mjs"')).toBe(true);
  });

  it('is judged from the check cwd joined to the run cwd', () => {
    const sub = input([{ command: 'node scripts/lint.mjs', cwd: 'tools' }]);

    expect(allowed(sub, 'node scripts/lint.mjs')).toBe(false);
    expect(allowed(sub, 'node scripts/lint.mjs', { cwd: `${ROOT}/tools` })).toBe(true);
    expect(allowed(sub, 'node scripts/lint.mjs', { cwd: `${ROOT}/other` })).toBe(false);
    expect(allowed(sub, 'node scripts/lint.mjs', { cwd: ROOT.toUpperCase() })).toBe(
      false,
    );

    expect(allowed(sub, 'cd tools && node scripts/lint.mjs')).toBe(false);
  });

  it('needs the run cwd to build any exact rule', () => {
    const noCwd: ShellAllowInput = {
      commands: ['node scripts/lint.mjs'],
      ecosystems: ['node'],
      checks: [{ command: 'node scripts/lint.mjs' }],
    };

    expect(allowed(noCwd, 'node scripts/lint.mjs')).toBe(false);
  });

  it('is an unattended-lane rule: Standard and Full still ask', () => {
    for (const lane of ['standard', 'full'] as const) {
      expect(verdict(lane, LINT, 'node scripts/lint.mjs').effect).toBe('ask');
    }
  });

  it('a project deny rule still narrows it', () => {
    const grant = effectiveGrant(
      'express',
      parseGrant({
        rules: [{ action: 'shell', resource: 'node scripts/lint.mjs', effect: 'deny' }],
      }),
      undefined,
      [],
      { dataHome: '/forge-home' },
      LINT,
    );

    const t = tokenizeShell('node scripts/lint.mjs', 'bash');
    if (!t.ok) {
      throw new Error(t.error);
    }

    expect(evaluateShell(grant, t.value, 'bash', ROOT).effect).toBe('deny');
  });
});

describe('fixed module checks are exact too', () => {
  it.each([
    ['python -m pytest', 'python -m pytest'],
    ['python3 -m ruff check .', 'python3 -m ruff check .'],
    ['python -m unittest', 'python -m unittest'],
    ['python -m mypy .', 'python -m mypy .'],
    ['node --test', 'node --test'],
  ])('check "%s" allows exactly that text', (check, cmd) => {
    expect(allowed(input([{ command: check }]), cmd)).toBe(true);
  });

  it.each([
    'python -m pytest -p evil',
    'python -m pytest -c evil.ini',
    'python -m pytest tests/',
    'python -m pip install x',
    'python -c "print(1)"',
    'node --test --import ./evil.mjs',
    'node --test-reporter=./evil.mjs',
  ])('with "python -m pytest" and "node --test" configured, %s is not allowed', (cmd) => {
    const shell = input([{ command: 'python -m pytest' }, { command: 'node --test' }]);

    expect(allowed(shell, cmd)).toBe(false);
  });
});

describe('checks that never get an exact rule', () => {
  it.each([
    'node',
    'node -e "process.exit(0)"',
    'node --eval x',
    'python -c "print(1)"',
    'pwsh -Command Get-Date',
    'powershell -EncodedCommand AAAA',
    'bash -c ls',
    'npx eslint .',
    'pnpm dlx eslint',
    'uvx ruff',
    'bunx eslint',
    'node ../outside.mjs',
    'node /abs/lint.mjs',
    'node C:/lint.mjs',
    'node ~/lint.mjs',
    'node scripts\\lint.mjs',
    'node "scripts/a b.mjs"',
    "node 'scripts/lint.mjs'",
    'node scripts/*.mjs',
    'node scripts/lint.mjs; rm x',
    'node scripts/lint.mjs | tee x',
    'node scripts/lint.mjs > out',
    'node scripts/$X.mjs',
    'node lint',
    'FOO=1 node scripts/lint.mjs',
    '/usr/bin/node scripts/lint.mjs',
    'python -m pytest -p evil',
  ])('configured check %j produces no allow', (check) => {
    const grant = effectiveGrant(
      'express',
      undefined,
      undefined,
      [],
      { dataHome: '/forge-home' },
      input([{ command: check }]),
    );

    expect(grant.ruleLayers[0]?.rules.some((r) => r.strict !== undefined)).toBe(false);
  });

  it('a plain non-interpreter check keeps its prefix rule', () => {
    expect(
      allowed(input([{ command: './scripts/test.sh' }]), './scripts/test.sh --fast'),
    ).toBe(true);
  });
});

describe('exact rules cannot be written by a project or ticket grant', () => {
  it('parseGrant refuses a strict rule', () => {
    expect(() =>
      parseGrant({
        rules: [
          {
            action: 'shell',
            resource: 'node scripts/lint.mjs',
            effect: 'allow',
            strict: { cwd: ROOT },
          },
        ],
      }),
    ).toThrow();
  });

  it('an always-allow on an interpreter stays banned', () => {
    expect(() =>
      assertNotBannedAlwaysAllow({
        action: 'shell',
        resource: 'node scripts/lint.mjs',
        effect: 'allow',
      }),
    ).toThrow();
  });
});
