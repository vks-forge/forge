/**
 * `POST /projects` starting settings — pin the shapes the API accepts for checks.
 *
 * Why: a project is usable from its first settings version only if the body that creates
 *   it can carry its checks, in any language. Clients written before checks were a
 *   role-tagged list still send `profile` + `commands`; they must keep working, and the
 *   stored first version must be the new shape (d-0095). A malformed check must be a 400
 *   at the door, not a project with no checks.
 *
 * Pins: new-shape checks and ecosystems accepted, old profile/commands accepted and
 *   converted by the settings schema, empty command / unknown role / unknown key refused.
 * Depends on: src/schemas/api, @forge/core (ProjectOverride), vitest.
 */

import { ProjectOverride } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { ProjectCreateBody } from '#/schemas/api.js';

const body = (settings: unknown) => ({
  slug: 'svc',
  prefix: 'SV',
  local_path: '/repos/svc',
  git_host: { kind: 'local', remote_path: '/remotes/svc.git' },
  settings,
  author: 'tester',
});

describe('ProjectCreateBody settings', () => {
  it('accepts checks with roles and a cwd, and ecosystems', () => {
    const r = ProjectCreateBody.safeParse(
      body({
        checks: [
          { name: 'vet', role: 'lint', command: 'go vet ./...' },
          { name: 'unit', role: 'test', command: 'go test ./...', cwd: 'svc' },
        ],
        ecosystems: ['go'],
      }),
    );

    expect(r.success).toBe(true);
  });

  it('accepts the old profile and commands and converts them to checks', () => {
    const r = ProjectCreateBody.parse(
      body({ profile: 'ts', commands: { test: 'pnpm test', lint: 'pnpm lint' } }),
    );

    const doc = ProjectOverride.parse(r.settings) as {
      checks: { role: string }[];
      ecosystems: string[];
    };

    expect(doc.checks.map((c) => c.role)).toEqual(['lint', 'test']);
    expect(doc.ecosystems).toEqual(['node']);
  });

  it.each([
    ['an empty command', { checks: [{ name: 't', role: 'test', command: '' }] }],
    ['an unknown role', { checks: [{ name: 't', role: 'deploy', command: 'x' }] }],
    [
      'an unknown key on a check',
      { checks: [{ name: 't', role: 'test', command: 'x' }], extra: 1 },
    ],
  ])('refuses %s', (_name, settings) => {
    const r = ProjectCreateBody.safeParse(body(settings));
    const overrideOk = ProjectOverride.safeParse(settings).success;

    expect(r.success && overrideOk).toBe(false);
  });
});
