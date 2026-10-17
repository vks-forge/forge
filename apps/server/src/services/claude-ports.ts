/**
 * The real Worker driver and Director model: the Claude adapters.
 *
 * Why: the server is harness-neutral; which harness runs Workers is picked here from
 *   config and nowhere else (code.md rules 2 and 3). The Claude driver talks to the ACP
 *   adapter (or `claude -p` as the fallback engine) and needs the run preparation the
 *   assembly supplies. The Director's steps run on `claude -p` from an empty directory so
 *   no project settings or CLAUDE.md can reach a model call that must see only its input
 *   (d-0032). Both run the `claude` the user installed, with the auth mode the owner chose
 *   per harness (own login, API key or OAuth token); the settings and credential are read
 *   when a run starts, so an edit in Settings applies to the next run and a missing install
 *   fails that run with the install pointer, never at boot (the owner may be about to set
 *   the path in Settings). Neither child inherits the server's environment beyond the
 *   drivers' allowlist (the catalogue key, GitHub credentials and any API key in the server's
 *   own env stay out of reach of model-chosen shell commands). `FORGE_CLAUDE_BINARY` is the
 *   default executable when the registry gives no path.
 *
 *   The compatibility check (d-0088) drives the same engine against a scripted model.
 *
 * Exports: createClaudePorts().
 * Depends on: node:fs, node:os, node:path, @forge/drivers, types/server, types/settings.
 *   IO: creates one empty temp directory for the Director's working directory; `dispose()`
 *   removes it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createClaudeDirectorLLM,
  checkInstalled,
  createClaudeDriver,
  installedBuild,
  nodeSpawn,
  systemClock,
  testClaudeHarness,
} from '@forge/drivers';
import type { HarnessSetup } from '@forge/drivers';
import type { Logger } from '@forge/engine';
import type { ExternalPorts } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

/** Claude Code as the Worker harness and the Director's model. */
export function createClaudePorts(settings: ServerSettings, log: Logger): ExternalPorts {
  const claudeBinary = settings.claudeBinary ?? 'claude';
  const envPassthrough = [...settings.harnessEnvPassthrough];
  const compatDeps = (setup: HarnessSetup) => ({
    source: () => setup,
    spawn: nodeSpawn,
    clock: systemClock,
    engine: settings.engine,
    baseEnv: settings.env,
    envPassthrough,
    defaultBinary: claudeBinary,
  });

  const directorDir = mkdtempSync(join(tmpdir(), 'forge-director-'));

  return {
    log,
    driver: (deps) =>
      createClaudeDriver({
        config: { engine: settings.engine, claudeBinary, envPassthrough },
        harness: deps.harness,
        secrets: deps.secrets,
        prepareRun: deps.prepareRun,
        receipts: deps.receipts,
        clock: systemClock,
        spawn: nodeSpawn,
        log: deps.log,
        baseEnv: settings.env,
        hookJsPath: settings.layout.hookJsPath,
      }),
    llm: (wiring) =>
      createClaudeDirectorLLM({
        spawn: nodeSpawn,
        clock: systemClock,
        baseEnv: settings.env,
        envPassthrough,
        cwd: directorDir,
        log,
        claudeBinary,
        harness: wiring.harness,
        secrets: wiring.secrets,
        ...(wiring.onTrace ? { onTrace: wiring.onTrace } : {}),
      }),
    harnessTest: (setup, live, secrets) =>
      testClaudeHarness(
        {
          spawn: nodeSpawn,
          clock: systemClock,
          source: () => setup,
          secrets,
          baseEnv: settings.env,
          envPassthrough,
          defaultBinary: claudeBinary,
        },
        { live },
      ),
    compat: {
      engine: settings.engine,
      installedVersion: async (setup) =>
        (await installedBuild(compatDeps(setup))).version,
      check: (setup, nativeTools) => checkInstalled(compatDeps(setup), nativeTools),
    },
    dispose: () => rmSync(directorDir, { recursive: true, force: true }),
  };
}
