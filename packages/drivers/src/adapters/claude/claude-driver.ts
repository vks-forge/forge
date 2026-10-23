/**
 * `createClaudeDriver(deps)`: the Claude Code `WorkerDriver`.
 *
 * Why: the Director starts, steers, resumes and cancels Workers through one port and must
 *   not know which Claude engine runs them. This factory is the composition point: it
 *   validates the request at the boundary, asks the app to prepare the run (directory,
 *   token, MCP server), renders the hook files the harness needs, records the git base to
 *   diff against, picks the engine from config (ACP by default, `claude -p` as fallback;
 *   never by branching on a harness name elsewhere) and hands the run to a supervisor that
 *   owns events, timers, the receipt cross-check and the final result. Each run first
 *   resolves the user's installed `claude` and, for an API key or OAuth token harness,
 *   reads that credential from the SecretStore into this run's child env only; a missing
 *   install or credential fails the start before anything is spawned (d-0087). A run's handle is
 *   serialisable; the live state is kept in this process only. A Forge restart does not end
 *   a run: the Director starts it again with `req.resume` (the saved session) and a new
 *   `req.generation`, and `start` prepares it from scratch (new token, a hook config with the
 *   new server URL and port, d-0092), so nothing about a resume needs the old process. The
 *   driver also declares the models it offers and runs one tool-less probe call, so an agent's
 *   model and instructions can be tested without a worktree or a session.
 *
 * Exports: createClaudeDriver(), CONTINUE_PROMPT.
 * Depends on: @forge/core (RunRequest, InvalidInputError, port types), run-supervisor,
 *   run-files, settings-sources, git-cli, harness-resolver, acp-engine, cli-engine,
 *   domain/child-env, domain/claude-models, adapters/claude/agent-probe, schemas/claude-config. IO: through the injected ports and the run files.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { InvalidInputError, RunRequest } from '@forge/core';
import type { RunHandle, WorkerDriver } from '@forge/core';
import { createAcpEngine } from '#/adapters/claude/acp/acp-engine.js';
import { probeClaude } from '#/adapters/claude/agent-probe.js';
import { createCliEngine } from '#/adapters/claude/cli/cli-engine.js';
import { createGitCli } from '#/adapters/claude/git-cli.js';
import { createHarnessResolver } from '#/adapters/claude/harness-resolver.js';
import { writeRunFiles } from '#/adapters/claude/run-files.js';
import { superviseRun } from '#/adapters/claude/run-supervisor.js';
import {
  existingSettingsSources,
  settingsSourcePaths,
} from '#/adapters/claude/settings-sources.js';
import { allowlistEnv, buildChildEnv, withPathFirst } from '#/domain/child-env.js';
import { CLAUDE_MODELS } from '#/domain/claude-models.js';
import { parseClaudeConfig } from '#/schemas/claude-config.js';
import type { SupervisedRun } from '#/types/claude/supervisor.types.js';
import type { ClaudeDriverDeps } from '#/types/claude/driver-deps.types.js';
import type { ClaudeEngine, EngineDeps } from '#/types/claude/engine.types.js';

/** Prompt sent when `resume(handle)` continues a session without a new instruction. */
export const CONTINUE_PROMPT = 'Continue from where you stopped.';

const ENGINES: Record<'acp' | 'cli', (deps: EngineDeps) => ClaudeEngine> = {
  acp: createAcpEngine,
  cli: createCliEngine,
};

export function createClaudeDriver(deps: ClaudeDriverDeps): WorkerDriver {
  const config = parseClaudeConfig(deps.config);
  const platform = deps.platform ?? process.platform;
  const baseEnv = allowlistEnv(deps.baseEnv ?? process.env, config.envPassthrough);
  const log = deps.log ?? (() => undefined);
  const git = deps.git ?? createGitCli();
  const hookJsPath =
    deps.hookJsPath ?? fileURLToPath(new URL('../../../bin/hook.js', import.meta.url));

  const resolver = createHarnessResolver({
    platform,
    env: baseEnv,
    exists: deps.fileExists ?? existsSync,
    defaultBinary: config.claudeBinary,
    source: deps.harness,
    secrets: deps.secrets,
  });

  const factory = deps.engineFactories?.[config.engine] ?? ENGINES[config.engine];
  const engine = factory({
    config,
    clock: deps.clock,
    spawn: deps.spawn,
    platform,
    signalGroup: deps.signalGroup,
    log,
    baseEnv,
    acpEntry: deps.acpEntry,
    resolver,
  });

  const capabilities = engine.capabilities();
  const runs = new Map<string, SupervisedRun>();

  const get = (handle: RunHandle): SupervisedRun => {
    const run = runs.get(handle.runId);
    if (!run) {
      throw new InvalidInputError(`unknown run ${handle.runId}`);
    }

    return run;
  };

  async function begin(
    req: RunRequest,
    resumeSession: string | undefined,
    prompt: string,
  ): Promise<RunHandle> {
    // Before prepareRun: a missing install or credential must not leave a run directory behind.
    const harness = await resolver.forRun();
    const prepared = await deps.prepareRun(req);
    const files = await writeRunFiles(req.runId, prepared, hookJsPath);
    const checked = settingsSourcePaths(req.cwd, deps.homeDir ?? homedir(), platform);
    log('info', 'settings sources the harness reads regardless of settingSources', {
      checked,
      existing: await existingSettingsSources(checked),
    });

    let base: string | null = null;
    try {
      base = await git.head(req.cwd);
    } catch (e) {
      log('warn', 'git head failed; files touched will be empty', { error: String(e) });
    }

    const env = withPathFirst(
      buildChildEnv(baseEnv, req.env, prepared.env, harness.authEnv),
      req.pathPrepend ?? [],
      platform === 'win32' ? ';' : ':',
    );

    const run = superviseRun({
      req,
      config,
      clock: deps.clock,
      receipts: deps.receipts,
      git,
      log,
      base,
      startSession: resumeSession ?? null,
      launch: (sink) =>
        engine.launch(
          {
            req,
            prepared,
            files,
            env,
            claudeBinary: harness.binaryPath,
            authMode: harness.authMode,
            prompt,
            resumeSession,
          },
          sink,
        ),
    });

    runs.set(req.runId, run);

    return { runId: req.runId, ...(resumeSession ? { session: resumeSession } : {}) };
  }

  return {
    id: 'claude-code',
    capabilities: () => capabilities,
    preflight: () => engine.preflight(),
    async start(req) {
      const parsed = RunRequest.safeParse(req);
      if (!parsed.success) {
        throw new InvalidInputError(`invalid run request: ${parsed.error.message}`, {
          cause: parsed.error,
        });
      }

      const live = runs.get(parsed.data.runId);
      if (live && !live.isSettled()) {
        throw new InvalidInputError(`run ${parsed.data.runId} is already active`);
      }

      return begin(parsed.data, parsed.data.resume, parsed.data.prompt);
    },
    async resume(handle) {
      const prior = get(handle);
      if (!prior.isSettled()) {
        throw new InvalidInputError(`run ${handle.runId} is still active`);
      }

      const session = handle.session ?? prior.session();
      if (!session) {
        throw new InvalidInputError(`run ${handle.runId} has no session to resume`);
      }

      return begin(prior.req, session, CONTINUE_PROMPT);
    },
    steer: (handle, message, mode, inboxSeq) =>
      get(handle).steer(message, mode, inboxSeq),
    cancel: (handle) => get(handle).cancel(),
    events: (handle) => get(handle).events.iterate(),
    result: (handle) => get(handle).result,
    models: async () => CLAUDE_MODELS,
    probe: (req) =>
      probeClaude({ spawn: deps.spawn, clock: deps.clock, resolver, baseEnv }, req),
  };
}
