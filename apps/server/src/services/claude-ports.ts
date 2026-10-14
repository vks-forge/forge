/**
 * The real Worker driver and Director model: the Claude adapters.
 *
 * Why: the server is harness-neutral; which harness runs Workers is picked here from
 *   config and nowhere else (code.md rules 2 and 3). The Claude driver talks to the ACP
 *   adapter (or `claude -p` as the fallback engine) and needs the run preparation the
 *   assembly supplies. The Director's steps run on `claude -p` from an empty directory so
 *   no project settings or CLAUDE.md can reach a model call that must see only its input
 *   (d-0032). Both use the logged-in subscription; no API key is read, and neither child
 *   inherits the server's environment beyond the drivers' allowlist (the catalogue key and
 *   GitHub credentials stay out of reach of model-chosen shell commands). On Windows the
 *   `claude` binary is resolved to a real `.exe` once, here, so a `.cmd` shim fails at
 *   startup with a clear message instead of in the middle of a ticket.
 *
 * Exports: createClaudePorts().
 * Depends on: node:fs, node:os, node:path, @forge/drivers, types/server, types/settings.
 *   IO: creates one empty temp directory for the Director's working directory; `dispose()`
 *   removes it.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createClaudeDirectorLLM,
  createClaudeDriver,
  nodeSpawn,
  resolveClaudeBinary,
  systemClock,
} from '@forge/drivers';
import type { Logger } from '@forge/engine';
import type { ExternalPorts } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

/** Claude Code as the Worker harness and the Director's model. */
export function createClaudePorts(settings: ServerSettings, log: Logger): ExternalPorts {
  const claudeBinary = resolveClaudeBinary(settings.claudeBinary ?? 'claude', {
    platform: process.platform,
    pathVar: settings.env['Path'] ?? settings.env['PATH'],
    exists: existsSync,
  });

  const envPassthrough = [...settings.harnessEnvPassthrough];
  const directorDir = mkdtempSync(join(tmpdir(), 'forge-director-'));

  return {
    log,
    driver: (deps) =>
      createClaudeDriver({
        config: { engine: settings.engine, claudeBinary, envPassthrough },
        prepareRun: deps.prepareRun,
        receipts: deps.receipts,
        clock: systemClock,
        spawn: nodeSpawn,
        log: deps.log,
        baseEnv: settings.env,
      }),
    llm: createClaudeDirectorLLM({
      spawn: nodeSpawn,
      clock: systemClock,
      baseEnv: settings.env,
      envPassthrough,
      cwd: directorDir,
      log,
      claudeBinary,
    }),
    dispose: () => rmSync(directorDir, { recursive: true, force: true }),
  };
}
