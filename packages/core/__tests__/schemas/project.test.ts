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
import { ProjectConfig } from '#/schemas/project.js';

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
