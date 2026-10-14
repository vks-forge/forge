/**
 * The GitHub host of a project that was added through a GitHub connection.
 *
 * Why: such a project stores no App id or key name of its own; both come from the connection
 *   row (d-0094), so a replaced key touches one place. The key must be read from the name the
 *   connection holds, a host with neither an App id nor a connection must fail when it is
 *   built (not when the first PR is opened), and a disabled connection must not serve.
 *
 * Pins: key name from the connection, no-App-id error, disabled-connection error.
 * Depends on: src/services/git-host, @forge/secrets (memory store). No IO.
 */

import { ProjectConfig } from '@forge/core';
import { createMemorySecretStore } from '@forge/secrets';
import { describe, expect, it } from 'vitest';
import { createProjectGitHost } from '#/services/git-host.js';

const base = {
  slug: 'demo',
  prefix: 'DM',
  profile: 'generic' as const,
  default_harness: 'claude-code',
};

const dir = process.cwd();

describe('createProjectGitHost through a connection', () => {
  const connection = {
    id: 'acme',
    account: 'acme-inc',
    app_id: '77',
    key_secret_name: 'github/acme/key',
    status: 'active' as const,
    created_at: '2026-10-14T00:00:00.000Z',
  };

  const hostOnly = ProjectConfig.parse({
    ...base,
    git_host: { kind: 'github', owner: 'o', repo: 'r', installation_id: '2' },
  });

  it('reads the key from the name the connection holds, not from project settings', async () => {
    const secrets = createMemorySecretStore();
    const host = createProjectGitHost(hostOnly, {
      root: dir,
      secrets,
      now: () => 0,
      connection,
    });

    await expect(host?.prStatus(1)).rejects.toThrow(
      /github\/acme\/key.*not in the secret store/,
    );
  });

  it('refuses a GitHub host that has neither an App id nor a connection', () => {
    expect(() =>
      createProjectGitHost(hostOnly, {
        root: dir,
        secrets: createMemorySecretStore(),
        now: () => 0,
      }),
    ).toThrow(/no App id and no connection/);
  });

  it('refuses a disabled connection', () => {
    expect(() =>
      createProjectGitHost(hostOnly, {
        root: dir,
        secrets: createMemorySecretStore(),
        now: () => 0,
        connection: { ...connection, status: 'disabled' },
      }),
    ).toThrow(/is disabled/);
  });
});
