/**
 * Pins: the first-run and inspection answers accept what the server sends and refuse what it must not.
 *
 * Why: the wizard decides what to show from `GET /system`, and the new-project form from
 *   `POST /projects/inspect`; a drifting shape would break first run silently.
 *
 * Depends on: src/schemas/onboarding.
 */

import { describe, expect, it } from 'vitest';
import { ProjectInspection, SystemInfo } from '#/schemas/onboarding.js';

describe('SystemInfo', () => {
  const ok = {
    service: 'forge',
    version: '0.0.0',
    data_home: 'C:\\Forge',
    first_run: { complete: false, project_count: 0, harness_ok: false },
  };

  it('accepts the server answer', () => {
    expect(SystemInfo.parse(ok)).toEqual(ok);
  });

  it('refuses another service name and a negative count', () => {
    expect(SystemInfo.safeParse({ ...ok, service: 'other' }).success).toBe(false);
    expect(
      SystemInfo.safeParse({ ...ok, first_run: { ...ok.first_run, project_count: -1 } })
        .success,
    ).toBe(false);
  });
});

describe('ProjectInspection', () => {
  it('accepts a detached HEAD (no current branch) and checks', () => {
    const parsed = ProjectInspection.safeParse({
      local_path: '/r',
      current_branch: null,
      base_branch: 'main',
      branches: ['main'],
      branches_truncated: false,
      ecosystems: ['node'],
      checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
      suggested_slug: 'r',
      suggested_prefix: 'R',
    });

    expect(parsed.success).toBe(true);
  });
});
