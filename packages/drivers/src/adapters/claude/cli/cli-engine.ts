/**
 * The CLI engine: hosts `claude -p --output-format stream-json --verbose` as a child.
 *
 * Why: the fallback when the ACP adapter is unavailable or misbehaves. It gives the same
 *   answers to the Director (same events, same result families, same pause on
 *   `ask_director`, same receipt cross-check) from a different input: one JSON line per
 *   event on stdout and a final `result` line. It cannot be steered while running and does
 *   not bridge permission prompts, so it declares neither: tools run only if the request's
 *   allow list lets them, and the per-run hook decides the rest (d-0035). The exit code is
 *   not trusted: a budget stop exits 0 without result text (probe 1), so the `result`
 *   line's subtype decides. A process that printed its result but did not exit is killed
 *   after the cancel grace, because a lingering harness keeps the worktree open.
 *
 * Exports: createCliEngine().
 * Depends on: node:readline, @forge/core (InvalidInputError), process-tree, version-probe,
 *   domain/{cli-args,cli-events,failure-classify,child-env}, schemas/claude-stream-json.
 *   IO: the `claude` child process.
 */

import { createInterface } from 'node:readline';
import { InvalidInputError } from '@forge/core';
import { killTree } from '#/adapters/claude/process-tree.js';
import { probeVersion } from '#/adapters/claude/version-probe.js';
import { buildChildEnv } from '#/domain/child-env.js';
import { buildCliArgs } from '#/domain/cli-args.js';
import { normaliseCliLine, usageFromResult } from '#/domain/cli-events.js';
import { classifyCliResult, retryNotBeforeFrom } from '#/domain/failure-classify.js';
import { parseCliLine } from '#/schemas/claude-stream-json.js';
import type { CliResultLine } from '#/schemas/claude-stream-json.js';
import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { ChildLike } from '#/types/claude/driver-deps.types.js';
import type {
  ClaudeEngine,
  EngineDeps,
  EngineEnd,
  EngineHandle,
  EngineLaunch,
  EngineSink,
} from '#/types/claude/engine.types.js';

function launchCli(
  deps: EngineDeps,
  launch: EngineLaunch,
  sink: EngineSink,
): EngineHandle {
  const { clock, config } = deps;
  const state = {
    result: null as CliResultLine | null,
    rateLimit: null as RateLimitInfo | null,
    session: null as string | null,
  };
  const rate = (): string =>
    retryNotBeforeFrom(state.rateLimit, clock.now(), config.rateLimitBackoffMs);

  let child: ChildLike;
  try {
    child = deps.spawn(
      config.claudeBinary,
      buildCliArgs(launch.req, launch.files, launch.resumeSession),
      {
        cwd: launch.req.cwd,
        env: launch.env,
        detached: deps.platform !== 'win32',
      },
    );
  } catch (e) {
    return {
      ended: Promise.resolve({
        kind: 'crash',
        detail: `cannot start claude: ${e instanceof Error ? e.message : String(e)}`,
      }),
      steer: () => Promise.reject(new InvalidInputError('claude did not start')),
      cancel: () => Promise.resolve(),
    };
  }

  let stderrTail = '';
  child.stderr.on(
    'data',
    (d: Buffer) => (stderrTail = (stderrTail + d.toString('utf8')).slice(-1500)),
  );
  child.stdin.on('error', () => undefined);
  child.stdin.end(launch.prompt);
  sink.turnStarted();

  let exited = false;
  let killed = false;
  const kill = async (): Promise<void> => {
    if (killed || exited) return;
    killed = true;
    await killTree(child, {
      platform: deps.platform,
      spawn: deps.spawn,
      ...(deps.signalGroup ? { signalGroup: deps.signalGroup } : {}),
    });
  };

  const lines = createInterface({ input: child.stdout });
  lines.on('line', (raw) => {
    const parsed = parseCliLine(raw);
    if (!parsed) return;
    sink.activity();
    const n = normaliseCliLine(parsed);
    if (n.session && n.session !== state.session) {
      state.session = n.session;
      sink.setSession(n.session);
    }
    if (n.rateLimit) state.rateLimit = n.rateLimit;
    for (const e of n.events) sink.emit(e);
    if (n.result) {
      state.result = n.result;
      sink.turnEnded();
      if (n.result.total_cost_usd !== undefined) sink.setCostUsd(n.result.total_cost_usd);
      const usage = usageFromResult(n.result);
      sink.setUsage(usage);
      sink.emit({ type: 'usage', usage });
      // Terminal-result watchdog: the result is final, so a process that lingers is killed.
      clock.after(config.cancelGraceMs, () => void kill());
    }
  });
  const drained = new Promise<void>((resolve) => lines.on('close', () => resolve()));

  const exit = new Promise<{
    code: number | null;
    signal: string | null;
    error?: string;
  }>((resolve) => {
    child.on('exit', (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
    child.on('error', (e) => {
      exited = true;
      resolve({ code: null, signal: null, error: e.message });
    });
  });

  const ended: Promise<EngineEnd> = Promise.all([exit, drained]).then(([x]) => {
    sink.turnEnded();
    if (x.error) return { kind: 'crash', detail: `claude failed: ${x.error}` };
    if (state.result) {
      const end = classifyCliResult(state.result, rate);
      if (
        (end.kind === 'unknown' || end.kind === 'crash') &&
        state.rateLimit?.status === 'rejected'
      )
        return {
          kind: 'rate_limit',
          detail: end.detail ?? 'rate limit rejected',
          retryNotBefore: rate(),
        };
      return end;
    }
    if (state.rateLimit?.status === 'rejected')
      return {
        kind: 'rate_limit',
        detail: 'rate limit rejected',
        retryNotBefore: rate(),
      };
    return {
      kind: 'crash',
      detail:
        `claude exited (code ${x.code}, signal ${x.signal}) without a result ${stderrTail}`.trim(),
    };
  });

  return {
    ended,
    steer: () =>
      Promise.reject(
        new InvalidInputError('the CLI engine cannot steer a running claude -p'),
      ),
    async cancel() {
      if (exited) return;
      child.kill('SIGTERM');
      let stopTimer = (): void => undefined;
      const graceElapsed = new Promise<boolean>((resolve) => {
        stopTimer = clock.after(config.cancelGraceMs, () => resolve(false));
      });
      const stopped = await Promise.race([ended.then(() => true), graceElapsed]);
      stopTimer();
      if (!stopped) await kill();
    },
  };
}

export function createCliEngine(deps: EngineDeps): ClaudeEngine {
  return {
    kind: 'cli',
    capabilities: () => ({
      resume: true,
      steerModes: [],
      nativeSandbox: false,
      reportsCost: true,
      structuredOutput: false,
      permissionRequests: false,
    }),
    async preflight() {
      const env = buildChildEnv(deps.baseEnv, {}, {});
      const version = await probeVersion(
        deps.spawn,
        deps.clock,
        deps.config.claudeBinary,
        ['--version'],
        env,
      );
      return version === null
        ? {
            ok: false,
            issues: [
              `missing binary: ${deps.config.claudeBinary} did not report a version`,
            ],
          }
        : { ok: true, issues: [], version };
    },
    launch: (launch, sink) => launchCli(deps, launch, sink),
  };
}
