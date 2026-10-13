/**
 * Tests for the ProjectConfig schema.
 *
 * Why: project.yaml is the only per-repo configuration, and a bad prefix or slug would
 *   corrupt every ticket id and branch for that project. Rejecting it at load turns a
 *   typo into a startup error rather than a gate or Worker failing mid-ticket (d-0034).
 *
 * Pins: minimal config parses, commands/remote parse, unknown profile / bad prefix /
 *   bad slug are rejected (d-0034).
 * Depends on: src/schemas/project, vitest.
 */

import { describe, expect, it } from 'vitest';
import { Project, ProjectConfig } from '#/schemas/project.js';

describe('ProjectConfig git_host', () => {
  const ok = {
    slug: 'sf',
    prefix: 'SF',
    profile: 'ts',
    default_harness: 'claude-code',
  };

  const gh = {
    kind: 'github',
    owner: 'o',
    repo: 'r',
    app_id: '123',
    installation_id: '456',
  };

  it('defaults base_branch and key_secret', () => {
    const r = ProjectConfig.parse({ ...ok, git_host: gh });
    expect(r.git_host).toMatchObject({
      base_branch: 'main',
      key_secret: 'github-app-key',
    });

    const l = ProjectConfig.parse({
      ...ok,
      git_host: { kind: 'local', remote_path: 'D:/r.git' },
    });

    expect(l.git_host).toMatchObject({ base_branch: 'main' });
  });

  it('rejects non-numeric ids, a bad secret name and an unknown kind', () => {
    expect(
      ProjectConfig.safeParse({ ...ok, git_host: { ...gh, app_id: 'x1' } }).success,
    ).toBe(false);

    expect(
      ProjectConfig.safeParse({ ...ok, git_host: { ...gh, key_secret: '../k' } }).success,
    ).toBe(false);

    expect(ProjectConfig.safeParse({ ...ok, git_host: { kind: 'gitlab' } }).success).toBe(
      false,
    );
  });
});

describe('ProjectConfig', () => {
  const ok = {
    slug: 'software-factory',
    prefix: 'SF',
    profile: 'ts',
    default_harness: 'claude-code',
  };

  it('parses minimal config', () => {
    expect(ProjectConfig.safeParse(ok).success).toBe(true);
  });

  it('parses commands and remote', () => {
    const r = ProjectConfig.safeParse({
      ...ok,
      commands: { test: 'pnpm test' },
      remote: 'https://github.com/x/y',
    });

    expect(r.success).toBe(true);
  });

  it('rejects unknown profile, bad prefix, bad slug', () => {
    expect(ProjectConfig.safeParse({ ...ok, profile: 'py' }).success).toBe(false);
    expect(ProjectConfig.safeParse({ ...ok, prefix: 'sf' }).success).toBe(false);
    expect(ProjectConfig.safeParse({ ...ok, slug: 'Bad Slug' }).success).toBe(false);
  });
});

describe('Project record (projects table)', () => {
  const project = {
    id: 'p1',
    slug: 'software-factory',
    prefix: 'SF',
    harness_defaults: { default: 'claude' },
    tier_c_globs: ['**/*.sql'],
  };

  it('parses with optional repo_origin and memory_repo', () => {
    expect(Project.safeParse(project).success).toBe(true);
    expect(
      Project.safeParse({ ...project, repo_origin: 'git@x', memory_repo: 'm' }).success,
    ).toBe(true);
  });

  it('rejects a bad slug or prefix', () => {
    expect(Project.safeParse({ ...project, slug: 'Bad Slug' }).success).toBe(false);
    expect(Project.safeParse({ ...project, prefix: 'sf' }).success).toBe(false);
  });
});
