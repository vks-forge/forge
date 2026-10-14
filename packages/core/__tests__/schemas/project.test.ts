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

describe('ProjectConfig tier_c_globs', () => {
  const ok = { slug: 'sf', prefix: 'SF', profile: 'ts', default_harness: 'claude-code' };

  it('defaults to Forge policy, harness settings and CI paths', () => {
    expect(ProjectConfig.parse(ok).tier_c_globs).toEqual([
      '.forge/**',
      '.claude/**',
      '.github/**',
    ]);
  });

  it('takes a project list as given and rejects an empty glob', () => {
    expect(ProjectConfig.parse({ ...ok, tier_c_globs: ['db/**'] }).tier_c_globs).toEqual([
      'db/**',
    ]);

    expect(ProjectConfig.safeParse({ ...ok, tier_c_globs: [''] }).success).toBe(false);
  });
});

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

  it('defaults base_branch and leaves the key and App id to a connection', () => {
    const r = ProjectConfig.parse({ ...ok, git_host: gh });
    expect(r.git_host).toMatchObject({ base_branch: 'main' });
    expect(
      ProjectConfig.parse({
        ...ok,
        git_host: { kind: 'github', owner: 'o', repo: 'r', installation_id: '456' },
      }).git_host,
    ).toMatchObject({ kind: 'github', installation_id: '456' });

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

  it('defaults to a ready project with no ecosystems and no deprecated globs', () => {
    const p = Project.parse({ id: 'p1', slug: 'sf', prefix: 'SF', harness_defaults: {} });
    expect(p).toMatchObject({ status: 'ready', ecosystems: [], tier_c_globs: [] });
  });

  it('takes the local clone, connection and repository, and rejects bad ones', () => {
    const linked = {
      ...project,
      local_path: 'D:/repos/sf',
      connection_id: 'acme',
      repo_full_name: 'acme/sf',
      status: 'onboarding',
      ecosystems: ['node'],
    };

    expect(Project.parse(linked)).toMatchObject({ status: 'onboarding' });
    expect(Project.safeParse({ ...linked, repo_full_name: 'no-slash' }).success).toBe(
      false,
    );

    expect(Project.safeParse({ ...linked, status: 'deleted' }).success).toBe(false);
  });

  it('rejects a bad slug or prefix', () => {
    expect(Project.safeParse({ ...project, slug: 'Bad Slug' }).success).toBe(false);
    expect(Project.safeParse({ ...project, prefix: 'sf' }).success).toBe(false);
  });
});
