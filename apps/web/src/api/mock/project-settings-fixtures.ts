/**
 * Sample saved settings for the mock adapter.
 *
 * Why: the screen must be seen with a project that has history (three versions by different
 *   authors, one overriding concurrency), one that never saved anything (version 0, all
 *   inherited) and a company override above both, otherwise the inherited-versus-overridden
 *   display and the history list have nothing to show. All values are plain samples.
 *
 * Exports: companyOverrideFixture, seedVersions().
 * Depends on: @forge/core (ConfigVersion type).
 */

import type { ConfigVersion } from '@forge/core';

/** The company document above every project: two Workers per project, one fallback harness. */
export const companyOverrideFixture = {
  engine: { max_concurrent_per_project: 2, harness_fallbacks: ['codex'] },
};

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-01T09:00:00Z');

const CHECKS = [
  { name: 'unit tests', role: 'test', command: 'pnpm test' },
  { name: 'lint', role: 'lint', command: 'pnpm lint' },
  { name: 'types', role: 'typecheck', command: 'pnpm typecheck' },
] as const;

function version(
  slug: string,
  n: number,
  doc: Record<string, unknown>,
  author: string,
  reason: string,
  at: number,
): ConfigVersion {
  return {
    id: n,
    scope: 'project',
    project: slug,
    version: n,
    doc: doc as never,
    author,
    reason,
    created_at: at,
  };
}

/** The saved versions a project starts the session with, oldest first. */
export function seedVersions(slug: string): ConfigVersion[] {
  if (slug === 'sample-service') {
    const v1 = {
      checks: [...CHECKS],
      default_harness: 'claude-code',
      ecosystems: ['node'],
    };

    const v2 = { ...v1, max_concurrent: 1 };
    const v3 = {
      ...v2,
      checks: [...CHECKS, { name: 'build', role: 'build', command: 'pnpm build' }],
    };

    return [
      version(slug, 1, v1, 'forge-onboarding', 'project created', T0),
      version(
        slug,
        2,
        v2,
        'owner',
        'keep one Worker while the suite is flaky',
        T0 + 9 * DAY,
      ),
      version(slug, 3, v3, 'owner', 'add the build check', T0 + 21 * DAY),
    ];
  }

  if (slug === 'sample-docs') {
    return [
      version(
        slug,
        1,
        { checks: [{ name: 'links', role: 'custom', command: 'pnpm check-links' }] },
        'forge-onboarding',
        'project created',
        T0 + 30 * DAY,
      ),
    ];
  }

  return [];
}
