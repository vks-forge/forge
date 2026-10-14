/**
 * Composition parts: the git host choice, the tool policy and the Claude ports.
 *
 * Why: these are the places where config becomes behaviour. A project's `git_host` must
 *   pick the right adapter (and none when absent, so its tickets stay in Verifying); a
 *   GitHub App key missing from the secret store must fail loudly with the fix, not mint a
 *   token from nothing; a catalogue that does not verify must stop the server, and a valid
 *   one must give every Forge tool a live hash and every native tool its pin; and building
 *   the real Claude ports must spawn nothing.
 *
 * Pins: local/github/none host selection, missing key is an AuthError, quarantined catalogue
 *   refused, admit context per run, createClaudePorts is lazy.
 * Depends on: src/services/git-host, tool-policy, claude-ports, helpers/fixture-repo. IO: temp files.
 */

import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthError, PolicyDeniedError, ProjectConfig, dataHomeLayout } from '@forge/core';
import type { Run } from '@forge/core';
import { createMemorySecretStore } from '@forge/secrets';
import { DEV_CATALOGUE_KEY } from '@forge/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveEntrypoints } from '#/config/entrypoints.js';
import { resolveLayout } from '#/config/paths.js';
import { createClaudePorts } from '#/services/claude-ports.js';
import { createProjectGitHost } from '#/services/git-host.js';
import { loadToolPolicy } from '#/services/tool-policy.js';
import type { ServerSettings } from '#/types/settings.types.js';
import { createFixtureRepo } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';

/** The Claude Code build the shipped catalogue was reviewed against (d-0053). */
const REVIEWED = { id: 'claude-code', version: '2.1.293' };

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
    await expect(host?.prStatus(1)).rejects.toThrow(/github-app-key.*forge secret wrap/);
  });
});

describe('loadToolPolicy', () => {
  let fixture: FixtureRepo;

  // Creating the fixture runs a dozen git processes; the full suite runs on a loaded machine.
  beforeEach(() => {
    fixture = createFixtureRepo();
  }, 60_000);

  afterEach(() => {
    fixture.dispose();
  });

  const layoutOf = () =>
    resolveLayout(
      fixture.root,
      dataHomeLayout(fixture.dataHome, process.platform),
      resolveEntrypoints(import.meta.url),
    );

  const settings = (over: Partial<ServerSettings> = {}): ServerSettings =>
    ({
      layout: layoutOf(),
      catalogueKey: DEV_CATALOGUE_KEY,
      allowDevCatalogueKey: true,
      ...over,
    }) as ServerSettings;

  const run = { lane: 'express', harness: 'claude-code', cwd: '/w' } as Run;

  it('verifies the catalogue and builds a per-run context with live hashes', async () => {
    const policy = await loadToolPolicy(settings(), REVIEWED);
    const ctx = await policy.admitContext(run);

    expect(policy.catalogueHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx).toMatchObject({ lane: 'express', harness: 'claude-code', cwd: '/w' });
    expect(Object.keys(ctx.liveSchemaHashes)).toEqual(
      expect.arrayContaining(['read', 'write', 'shell', 'mcp__forge__finish']),
    );
  });

  it('refuses a catalogue it cannot verify', async () => {
    await expect(
      loadToolPolicy(settings({ allowDevCatalogueKey: false }), REVIEWED),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
  });

  it('refuses a missing catalogue file', async () => {
    const layout = {
      ...layoutOf(),
      cataloguePath: join(dir, 'nope.yaml'),
    };

    await expect(loadToolPolicy(settings({ layout }), REVIEWED)).rejects.toThrow(
      /quarantined \(malformed\)/,
    );
  });

  it('refuses a catalogue edited after signing', async () => {
    const edited = join(dir, 'catalog.yaml');
    cpSync(layoutOf().cataloguePath, edited);
    const text = readFileSync(edited, 'utf8');
    writeFileSync(edited, text.replace('risk: read', 'risk: exec'));

    const layout = { ...layoutOf(), cataloguePath: edited };

    await expect(loadToolPolicy(settings({ layout }), REVIEWED)).rejects.toBeInstanceOf(
      PolicyDeniedError,
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
    });

    expect(driver.id).toBe('claude-code');
    expect(driver.capabilities().resume).toBe(true);
    expect(ports.llm.capabilities().structuredOutput).toBe(true);
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
    'refuses a claude.cmd shim at startup with the variable to set',
    () => {
      const shim = join(dir, 'claude.cmd');
      writeFileSync(shim, '@echo off');

      expect(() =>
        createClaudePorts(settingsFor({ claudeBinary: shim }), () => undefined),
      ).toThrow(/FORGE_CLAUDE_BINARY/);
    },
  );
});
