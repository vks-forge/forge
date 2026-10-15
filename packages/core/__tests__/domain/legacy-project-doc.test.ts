/**
 * Tests for the legacy project settings migration and the checks schema.
 *
 * Why: config versions written before checks existed (`profile` + `commands`) are kept
 *   forever. If they stopped reading, or read with fewer checks than they used to run,
 *   an upgrade would silently weaken verification for every existing project. These pin
 *   that an old document yields the same checks in the same order, and that the new
 *   shape is validated as strictly as the old one was (d-0095).
 *
 * Pins: ts/generic conversion, order, build included, no blanking of inherited checks,
 *   unknown profile rejected, new-shape validation (empty command, duplicate names,
 *   escaping cwd), stored override and effective-config round trip.
 * Depends on: src/domain/legacy-project-doc, src/domain/merge-config, src/schemas/*, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { migrateLegacyProjectDoc } from '#/domain/legacy-project-doc.js';
import { mergeConfig } from '#/domain/merge-config.js';
import { ProjectOverride } from '#/schemas/config-override.js';
import { ProjectConfig } from '#/schemas/project.js';

const commands = { test: 'pnpm test', lint: 'pnpm lint', typecheck: 'pnpm typecheck' };

describe('migrateLegacyProjectDoc', () => {
  it('converts a ts profile to checks in run order and the node ecosystem', () => {
    const out = migrateLegacyProjectDoc({
      profile: 'ts',
      commands: { ...commands, build: 'pnpm build' },
      default_harness: 'claude-code',
    });

    expect(out).toEqual({
      default_harness: 'claude-code',
      ecosystems: ['node'],
      checks: [
        { name: 'lint', role: 'lint', command: 'pnpm lint' },
        { name: 'typecheck', role: 'typecheck', command: 'pnpm typecheck' },
        { name: 'test', role: 'test', command: 'pnpm test' },
        { name: 'build', role: 'build', command: 'pnpm build' },
      ],
    });
  });

  it('drops typecheck under the generic profile, as the old gate skipped it', () => {
    const out = migrateLegacyProjectDoc({ profile: 'generic', commands }) as {
      checks: { role: string }[];
      ecosystems?: string[];
    };

    expect(out.checks.map((c) => c.role)).toEqual(['lint', 'test']);
    expect(out.ecosystems).toBeUndefined();
  });

  it('leaves a new-shape document untouched', () => {
    const doc = { checks: [{ name: 't', role: 'test', command: 'go test ./...' }] };

    expect(migrateLegacyProjectDoc(doc)).toBe(doc);
  });

  it('keeps checks already present and still drops the old keys', () => {
    const checks = [{ name: 't', role: 'test', command: 'cargo test' }];

    expect(migrateLegacyProjectDoc({ checks, commands })).toEqual({ checks });
  });

  it('adds no checks key for an override that set no command', () => {
    expect(migrateLegacyProjectDoc({ profile: 'ts', commands: {} })).toEqual({
      ecosystems: ['node'],
    });
  });
});

describe('legacy documents through the schemas', () => {
  const base = { slug: 'sf', prefix: 'SF', default_harness: 'claude-code' };

  it('ProjectConfig reads an old document as checks', () => {
    const r = ProjectConfig.parse({ ...base, profile: 'ts', commands });

    expect(r.checks.map((c) => c.name)).toEqual(['lint', 'typecheck', 'test']);
    expect(r.ecosystems).toEqual(['node']);
  });

  it('rejects an unknown legacy profile', () => {
    expect(ProjectConfig.safeParse({ ...base, profile: 'py' }).success).toBe(false);
    expect(ProjectOverride.safeParse({ profile: 'py' }).success).toBe(false);
  });

  it('ProjectOverride converts a stored old document and mergeConfig applies it', () => {
    const doc = ProjectOverride.parse({ profile: 'ts', commands: { test: 'pnpm test' } });
    const merged = mergeConfig(BUILTIN_CONFIG, {}, doc).project;

    expect(merged.checks).toEqual([{ name: 'test', role: 'test', command: 'pnpm test' }]);
    expect(merged.ecosystems).toEqual(['node']);
  });

  it('builtin defaults carry no checks and no ecosystems', () => {
    expect(BUILTIN_CONFIG.project).toMatchObject({ checks: [], ecosystems: [] });
  });
});

describe('checks schema', () => {
  const base = { slug: 'sf', prefix: 'SF', default_harness: 'claude-code' };
  const check = { name: 'unit', role: 'test', command: 'go test ./...' };

  it('accepts every role and a relative cwd', () => {
    for (const role of ['test', 'lint', 'typecheck', 'build', 'format', 'custom']) {
      const r = ProjectConfig.safeParse({
        ...base,
        checks: [{ ...check, role, cwd: 'services/api' }],
      });

      expect(r.success).toBe(true);
    }
  });

  it('rejects an empty command, an unknown role and duplicate names', () => {
    expect(
      ProjectConfig.safeParse({ ...base, checks: [{ ...check, command: '  ' }] }).success,
    ).toBe(false);

    expect(
      ProjectConfig.safeParse({ ...base, checks: [{ ...check, role: 'deploy' }] })
        .success,
    ).toBe(false);

    expect(ProjectConfig.safeParse({ ...base, checks: [check, check] }).success).toBe(
      false,
    );
  });

  it('rejects a cwd that leaves the repository', () => {
    for (const cwd of ['..', '../x', 'a/../../b', '/etc', 'C:\\x', '\\x']) {
      expect(
        ProjectConfig.safeParse({ ...base, checks: [{ ...check, cwd }] }).success,
      ).toBe(false);
    }
  });

  it('validates gate_rules and defaults its lists', () => {
    const ok = ProjectConfig.parse({ ...base, gate_rules: { test_globs: ['spec/**'] } });

    expect(ok.gate_rules).toEqual({
      config_globs: [],
      test_globs: ['spec/**'],
      skip_patterns: [],
      replace: false,
    });

    expect(
      ProjectConfig.safeParse({ ...base, gate_rules: { skip_patterns: ['('] } }).success,
    ).toBe(false);
  });
});
