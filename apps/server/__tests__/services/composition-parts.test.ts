/**
 * Composition parts: the git host choice and the Claude ports.
 *
 * Why: these are the places where config becomes behaviour. A project's `git_host` must
 *   pick the right adapter (and none when absent, so its tickets stay in Verifying); a
 *   GitHub App key missing from the secret store must fail loudly with the fix, not mint a
 *   token from nothing; and building the real Claude ports must spawn nothing.
 *
 * Pins: local/github/none host selection, the local host fetches the base into the project's clone,
 * missing key is an AuthError, createClaudePorts is lazy.
 * Depends on: src/services/git-host, claude-ports. IO: temp files.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthError, ProjectConfig } from '@forge/core';
import { createMemorySecretStore } from '@forge/secrets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClaudePorts } from '#/services/claude-ports.js';
import { createProjectGitHost } from '#/services/git-host.js';
import type { ServerSettings } from '#/types/settings.types.js';

const base = {
  slug: 'demo',
  prefix: 'DM',
  profile: 'generic' as const,
  default_harness: 'claude-code',
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'forge-parts-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createProjectGitHost', () => {
  const deps = () => ({ root: dir, secrets: createMemorySecretStore(), now: () => 0 });

  it('returns no host for a project without git_host', () => {
    expect(createProjectGitHost(ProjectConfig.parse(base), deps())).toBeNull();
  });

  it('builds the local bare host from remote_path', () => {
    const project = ProjectConfig.parse({
      ...base,
      git_host: { kind: 'local', remote_path: 'remote.git' },
    });

    expect(createProjectGitHost(project, deps())).toMatchObject({
      push: expect.any(Function),
      merge: expect.any(Function),
    });
  });

  it('lets the local host fetch the base into the project clone it was given', async () => {
    const git = (...args: string[]): string =>
      execFileSync(
        'git',
        ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args],
        {
          cwd: dir,
          encoding: 'utf8',
          windowsHide: true,
        },
      ).trim();

    git('init', '-b', 'main');
    writeFileSync(join(dir, 'a.txt'), 'a');
    git('add', '-A');
    git('commit', '-m', 'init', '--no-gpg-sign');
    git('clone', '--bare', '.', 'remote.git');
    const project = ProjectConfig.parse({
      ...base,
      git_host: { kind: 'local', remote_path: 'remote.git' },
    });

    const tip = await createProjectGitHost(project, deps())?.syncBase();

    expect(tip).toEqual({ ref: 'refs/forge/base/main', sha: git('rev-parse', 'main') });
  });

  it('asks for the App key by name and explains how to store it when missing', async () => {
    const project = ProjectConfig.parse({
      ...base,
      git_host: {
        kind: 'github',
        owner: 'o',
        repo: 'r',
        app_id: '1',
        installation_id: '2',
        key_secret: 'github-app-key',
      },
    });

    const host = createProjectGitHost(project, deps());

    await expect(host?.prStatus(1)).rejects.toBeInstanceOf(AuthError);
    await expect(host?.prStatus(1)).rejects.toThrow(
      /github-app-key.*not in the secret store/,
    );
  });
});

describe('createClaudePorts', () => {
  const settingsFor = (over: Record<string, unknown> = {}): ServerSettings =>
    ({
      engine: 'acp',
      env: {},
      harnessEnvPassthrough: [],
      claudeBinary: process.execPath,
      layout: { hookJsPath: '/forge/bin/hook.js' },
      ...over,
    }) as unknown as ServerSettings;

  it('builds the driver and Director model without starting anything', () => {
    const logged: string[] = [];
    const ports = createClaudePorts(
      settingsFor(),
      (_level, message) => void logged.push(message),
    );

    const driver = ports.driver({
      prepareRun: async () => {
        throw new Error('not used');
      },
      receipts: { decisionFor: async () => null },
      log: () => undefined,
      harness: () => ({ id: 'claude', authMode: 'login' }),
      secrets: createMemorySecretStore(),
    });

    const llm =
      typeof ports.llm === 'function'
        ? ports.llm({
            harness: () => ({ id: 'claude', authMode: 'login' }),
            secrets: createMemorySecretStore(),
          })
        : ports.llm;

    expect(driver.id).toBe('claude-code');
    expect(driver.capabilities().resume).toBe(true);
    expect(llm.capabilities().structuredOutput).toBe(true);
    expect(logged).toEqual([]);

    return ports.dispose?.();
  });

  it('removes the Director working directory on dispose', async () => {
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('forge-director-'));
    const ports = createClaudePorts(settingsFor(), () => undefined);
    const during = readdirSync(tmpdir()).filter((n) => n.startsWith('forge-director-'));

    await ports.dispose?.();

    const after = readdirSync(tmpdir()).filter((n) => n.startsWith('forge-director-'));
    expect(during.length).toBe(before.length + 1);
    expect(after).toEqual(before);
  });

  it.runIf(process.platform === 'win32')(
    'a claude.cmd shim is reported at preflight and at run start, naming the variable to set',
    async () => {
      const shim = join(dir, 'claude.cmd');
      writeFileSync(shim, '@echo off');

      const ports = createClaudePorts(
        settingsFor({ claudeBinary: shim }),
        () => undefined,
      );

      const driver = ports.driver({
        prepareRun: async () => {
          throw new Error('not used');
        },
        receipts: { decisionFor: async () => null },
        log: () => undefined,
        harness: () => ({ id: 'claude', authMode: 'login' }),
        secrets: createMemorySecretStore(),
      });

      const preflight = await driver.preflight();
      await ports.dispose?.();

      expect(preflight.ok).toBe(false);
      expect(preflight.issues.join(' ')).toMatch(/FORGE_CLAUDE_BINARY/);
    },
  );

  it('does not require claude to be installed to start, so the path can be set in Settings', async () => {
    const ports = createClaudePorts(
      settingsFor({ claudeBinary: 'forge-no-such-claude-xyz' }),
      () => undefined,
    );

    await ports.dispose?.();
    expect(typeof ports.llm).toBe('function');
  });
});
