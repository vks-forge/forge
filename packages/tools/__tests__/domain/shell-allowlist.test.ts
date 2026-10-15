/**
 * Shell allow-list tests — pin what a project's lane lets a Worker run without asking.
 *
 * Why: an unattended Express Worker can run its project's tests and lint only if the
 *   allow-list covers them, in any language (d-0095); and it must never become a way to
 *   run anything (interpreters, wrappers, package launchers, compound lines, pushes).
 *   These cases pin the ecosystem defaults, the rules derived from the project's own check
 *   commands, the refusal of commands that cannot safely be rules, and the real `admit()`
 *   verdicts for a Go, a Gradle and a .NET project.
 *
 * Pins: shellSafeRules() contents and exclusions, fall-back to every ecosystem, effectiveGrant
 *   accepting every ecosystem list (no banned-allow throw), admit() verdicts per project.
 * Depends on: domain/shell-allowlist, domain/grants, domain/admit, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { effectiveGrant } from '#/domain/grants.js';
import { ECOSYSTEM_SHELL_RULES, shellSafeRules } from '#/domain/shell-allowlist.js';
import type { ShellAllowInput } from '#/types/shell-allowlist.types.js';
import { FLOORS, call, makeCtx } from '#tests/helpers/fixtures.js';

const sh = (command: string) => call('shell', { command }, { native: 'PowerShell' });

function decide(shell: ShellAllowInput | undefined, command: string) {
  const grant = effectiveGrant('express', undefined, undefined, [], FLOORS, shell);

  return admit(makeCtx('express', { grant }), sh(command)).decision;
}

describe('shellSafeRules', () => {
  it('allows the verify commands of the named ecosystems and git, not the others', () => {
    const rules = shellSafeRules({ commands: [], ecosystems: ['go'] });

    expect(rules).toContain('go test*');
    expect(rules).toContain('git status*');
    expect(rules).not.toContain('pytest*');
    expect(rules).not.toContain('cargo test*');
  });

  it('adds each check command as a prefix rule exactly as configured', () => {
    const rules = shellSafeRules({
      commands: ['go test ./... -race', 'make   verify'],
      ecosystems: ['go'],
    });

    expect(rules).toContain('go test ./... -race*');
    expect(rules).toContain('make verify*');
  });

  it('implies the ecosystem from check commands when none is named', () => {
    const rules = shellSafeRules({ commands: ['dotnet test'], ecosystems: [] });

    expect(rules).toContain('dotnet test*');
    expect(rules).not.toContain('go test*');
  });

  it('allows every ecosystem when nothing says which one applies', () => {
    const rules = shellSafeRules();

    for (const list of Object.values(ECOSYSTEM_SHELL_RULES)) {
      for (const rule of list) {
        expect(rules).toContain(rule);
      }
    }
  });

  it.each([
    ['an interpreter', 'python -m pytest'],
    ['a node script', 'node scripts/lint.mjs'],
    ['a package launcher', 'npx vitest'],
    ['a pnpm launcher', 'pnpm exec vitest'],
    ['a wrapper', 'env CI=1 pytest'],
    ['a compound line', 'pnpm lint && pnpm test'],
    ['a pipe', 'go test ./... | tee out'],
    ['a substitution', 'go test $(pwd)'],
    ['a wildcard', 'go test *'],
    ['an empty command', '   '],
  ])('refuses %s as a rule', (_what, command) => {
    const rules = shellSafeRules({ commands: [command], ecosystems: ['go'] });

    expect(rules).not.toContain(`${command.trim()}*`);
    expect(rules.every((r) => r.trim() !== '*' && r.trim() !== '')).toBe(true);
  });

  it('never lists an install, a push or an interpreter among the defaults', () => {
    const all = Object.values(ECOSYSTEM_SHELL_RULES).flat();

    for (const rule of all) {
      expect(rule).not.toMatch(/\b(install|add|push|publish)\b/);
      expect(rule).not.toMatch(/^(python3?|node|bash|sh|ruby|php|npx)\b/);
    }
  });
});

describe('effectiveGrant with a project shell allow-list', () => {
  it.each(Object.keys(ECOSYSTEM_SHELL_RULES))(
    'builds for the %s ecosystem (no rule is a banned always-allow)',
    (ecosystem) => {
      expect(() =>
        effectiveGrant('express', undefined, undefined, [], FLOORS, {
          commands: [],
          ecosystems: [ecosystem],
        }),
      ).not.toThrow();
    },
  );

  it('builds even when a check command is an interpreter or a launcher', () => {
    expect(() =>
      effectiveGrant('express', undefined, undefined, [], FLOORS, {
        commands: ['python -m pytest', 'npx jest', 'bash -c "x"', 'git'],
        ecosystems: [],
      }),
    ).not.toThrow();
  });
});

describe('admit() for projects in other languages', () => {
  const go = { commands: ['go test ./...'], ecosystems: ['go'] };
  const gradle = { commands: ['./gradlew test'], ecosystems: ['jvm'] };
  const dotnet = { commands: ['dotnet test'], ecosystems: ['dotnet'] };

  it.each([
    [go, 'go test ./...', 'allow'],
    [go, 'go vet ./...', 'allow'],
    [go, 'pnpm test', 'deny'],
    [gradle, './gradlew test --info', 'allow'],
    [gradle, './gradlew check', 'allow'],
    [dotnet, 'dotnet test --no-build', 'allow'],
    [dotnet, 'dotnet build', 'allow'],
    [go, 'git status', 'allow'],
    [go, 'git push origin main', 'deny'],
    [go, 'go get example.com/x', 'deny'],
  ])('%j runs %s -> %s', (shell, command, decision) => {
    expect(decide(shell, command)).toBe(decision);
  });

  it('keeps the node and python defaults for a project that names nothing', () => {
    expect(decide(undefined, 'pnpm test')).toBe('allow');
    expect(decide(undefined, 'pytest -q')).toBe('allow');
    expect(decide(undefined, 'cargo test')).toBe('allow');
  });
});
