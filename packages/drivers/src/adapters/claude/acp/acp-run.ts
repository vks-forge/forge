/**
 * Runs one Worker through the ACP adapter process: connect, log in, session, turns, end.
 *
 * Why: the ACP adapter is the default way to host Claude Code because it gives live
 *   steering and session resume. A run is a fixed sequence that must not be reordered:
 *   `initialize`; wait for the adapter to report a subscription account (a logged-out host
 *   otherwise looks like a stall); `session/new` or `session/load` with the isolation
 *   options; `session/set_mode default` straight away, because the adapter still reads the
 *   user's settings and may start in `acceptEdits` (probe 3 finding A, d-0049); then the
 *   prompt loop. Permission requests are answered from the hook's receipts, not decided
 *   here. How the adapter ended each turn (stop reason or JSON-RPC error) is mapped by the
 *   shared classifier, and the process tree is always taken down afterwards so no adapter,
 *   bundled `claude` or MCP server outlives the run (d-0035, d-0053).
 *
 * Exports: launchAcp().
 * Depends on: @agentclientprotocol/sdk, @forge/core (InvalidInputError), acp-meta,
 *   acp-permission, acp-process, domain/{acp-events,failure-classify},
 *   schemas/claude-acp. IO: the adapter process and its stdio.
 */

import { Readable, Writable } from 'node:stream';
import { client, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { InvalidInputError } from '@forge/core';
import type { SteerMode } from '@forge/core';
import { sessionMeta, toAcpMcpServers } from '#/adapters/claude/acp/acp-meta.js';
import { answerPermission } from '#/adapters/claude/acp/acp-permission.js';
import { startAdapterProcess } from '#/adapters/claude/acp/acp-process.js';
import { normaliseAcpUpdate } from '#/domain/acp-events.js';
import {
  classifyRejection,
  classifyStopReason,
  retryNotBeforeFrom,
} from '#/domain/failure-classify.js';
import { AuthStatusUpdate, readSteering } from '#/schemas/claude-acp.js';
import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { AuthState } from '#/types/claude/acp.types.js';
import type {
  EngineDeps,
  EngineEnd,
  EngineHandle,
  EngineLaunch,
  EngineSink,
} from '#/types/claude/engine.types.js';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function launchAcp(
  deps: EngineDeps,
  entry: string,
  launch: EngineLaunch,
  sink: EngineSink,
): EngineHandle {
  const { clock, config, log } = deps;
  const { req } = launch;
  const state = {
    rateLimit: null as RateLimitInfo | null,
    sessionId: null as string | null,
    steering: false,
    accepting: false,
    closed: false,
    interrupting: false,
  };
  const queue: string[] = [launch.prompt];
  const rate = (): string =>
    retryNotBeforeFrom(state.rateLimit, clock.now(), config.rateLimitBackoffMs);

  const proc = startAdapterProcess(deps, entry, launch);
  if (!proc)
    return {
      ended: Promise.resolve({ kind: 'crash', detail: 'cannot start the ACP adapter' }),
      steer: () => Promise.reject(new InvalidInputError('adapter did not start')),
      cancel: () => Promise.resolve(),
    };
  const { child, exitedEnd, kill, hasExited } = proc;

  let authState: AuthState = 'unknown';
  let onAuth: (() => void) | null = null;
  let markReady: () => void = () => undefined;
  let failReady: (e: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });
  ready.catch(() => undefined);

  const app = client({ name: 'forge-driver' })
    .onRequest('session/request_permission', (c) => answerPermission(sink, c.params))
    .onNotification('session/update', (c) => {
      if (!state.accepting || c.params.sessionId !== state.sessionId) return;
      sink.activity();
      const n = normaliseAcpUpdate(c.params.update);
      if (n.rateLimit) state.rateLimit = n.rateLimit;
      if (n.costUsd !== undefined) sink.setCostUsd(n.costUsd);
      for (const e of n.events) sink.emit(e);
      if (n.dropped) log('debug', `ignored session update ${n.dropped}`);
    })
    .onNotification(
      '_auth/status_update',
      (p: unknown) => {
        const parsed = AuthStatusUpdate.safeParse(p);
        return parsed.success ? parsed.data : { authStatus: { kind: 'unparsed' } };
      },
      (c) => {
        const kind = c.params.authStatus.kind;
        if (kind === 'account') authState = 'account';
        else if (kind === 'none') authState = 'none';
        onAuth?.();
      },
    );
  const conn = app.connect(
    ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    ),
  );
  const ctx = conn.agent;

  function waitForAccount(): Promise<AuthState | 'timeout'> {
    if (authState !== 'unknown') return Promise.resolve(authState);
    return new Promise((resolve) => {
      const stop = clock.after(config.authTimeoutMs, () => {
        onAuth = null;
        resolve('timeout');
      });
      onAuth = () => {
        if (authState === 'unknown') return;
        stop();
        onAuth = null;
        resolve(authState);
      };
    });
  }

  async function turns(sessionId: string): Promise<EngineEnd> {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return { kind: 'completed' };
      sink.turnStarted();
      let end: EngineEnd;
      try {
        const resp = await ctx.request('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: next }],
        });
        const u = resp.usage;
        if (u) {
          const usage = {
            in: u.inputTokens,
            out: u.outputTokens,
            cachedIn: u.cachedReadTokens ?? 0,
            cacheWrite: u.cachedWriteTokens ?? 0,
          };
          sink.setUsage(usage);
          sink.emit({ type: 'usage', usage });
        }
        end = classifyStopReason(resp.stopReason, state.rateLimit, rate);
      } catch (e) {
        end = classifyRejection(e, state.rateLimit, rate);
      }
      sink.turnEnded();
      if (end.kind === 'cancelled' && state.interrupting) {
        state.interrupting = false;
        continue;
      }
      if (end.kind !== 'completed') return end;
    }
  }

  async function run(): Promise<EngineEnd> {
    const init = await ctx.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'forge-driver', version: '0.0.0' },
    });
    state.steering = readSteering(init._meta);
    const account = await waitForAccount();
    if (account !== 'account')
      return {
        kind: 'auth',
        detail:
          account === 'none'
            ? 'the adapter reports no Claude login'
            : `no account report from the adapter within ${config.authTimeoutMs} ms`,
      };
    const meta = sessionMeta(req, launch.files);
    const mcpServers = toAcpMcpServers(launch.prepared.mcpServers);
    let sessionId: string;
    if (launch.resumeSession) {
      sessionId = launch.resumeSession;
      await ctx.request('session/load', {
        sessionId,
        cwd: req.cwd,
        mcpServers,
        _meta: meta,
      });
    } else {
      sessionId = (
        await ctx.request('session/new', { cwd: req.cwd, mcpServers, _meta: meta })
      ).sessionId;
    }
    state.sessionId = sessionId;
    sink.setSession(sessionId);
    try {
      await ctx.request('session/set_mode', { sessionId, modeId: 'default' });
    } catch (e) {
      const detail = `session/set_mode default failed: ${message(e)}`;
      sink.abort('policy_denied', detail);
      return { kind: 'policy_denied', detail };
    }
    state.accepting = true;
    markReady();
    return turns(sessionId);
  }

  const running = run().catch((e: unknown): EngineEnd =>
    hasExited()
      ? { kind: 'crash', detail: message(e) }
      : classifyRejection(e, state.rateLimit, rate),
  );
  const ended: Promise<EngineEnd> = Promise.race([running, exitedEnd]).then(
    async (end) => {
      state.closed = true;
      failReady(new InvalidInputError('run ended before the session was ready'));
      conn.close();
      await kill();
      return end;
    },
  );

  return {
    ended,
    async steer(text: string, mode: SteerMode) {
      if (state.closed) throw new InvalidInputError('run is not accepting messages');
      await ready;
      if (mode === 'steer' && !(config.acpSteering && state.steering))
        throw new InvalidInputError('this adapter does not support live steering');
      const sessionId = state.sessionId ?? '';
      if (mode === 'follow_up') {
        queue.push(text);
      } else if (mode === 'interrupt') {
        state.interrupting = true;
        queue.unshift(text);
        await ctx.notify('session/cancel', { sessionId });
      } else {
        const out = await ctx.request<{ outcome?: string }>('_session/steering', {
          sessionId,
          prompt: [{ type: 'text', text }],
          _meta: { steering: { idleBehavior: 'promptRequired' } },
        });
        // Between turns there is nothing to inject into; the host owns the continuation.
        if (out.outcome === 'promptRequired') queue.push(text);
      }
    },
    async cancel() {
      if (state.closed) return;
      if (state.sessionId === null) {
        await kill();
        return;
      }
      try {
        await ctx.notify('session/cancel', { sessionId: state.sessionId });
      } catch {
        // the connection may already be gone; the grace timer below still ends the run
      }
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
