/**
 * Probe 3 harness: spawns the pinned ACP server over stdio and drives it with the SDK client.
 *
 * Why: The Claude driver will talk to the harness through its ACP server, and a wrong assumption about initialize, auth reporting or permission requests would only surface mid-run. This client records those messages exactly as the server sends them so the probe asserts on real traffic, not on documentation (d-0035).
 *
 * Exports: AcpHarness, claudeOptionsMeta(), withAcp(), TurnOutcome, promptTurn().
 * Depends on: @agentclientprotocol/sdk, helpers/probe-env, node:child_process, node:module,
 *   node:stream. IO: spawns the ACP server, which runs the user's installed claude (it is
 *   given `CLAUDE_CODE_EXECUTABLE`, as the driver does, d-0101).
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Readable, Writable } from 'node:stream';
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ActiveSession,
  type ClientContext,
  type InitializeResponse,
  type RequestPermissionRequest,
} from '@agentclientprotocol/sdk';
import { childEnv, installedClaudePath, PROBE_MODEL, slashPath } from './probe-env.js';

export interface AcpHarness {
  ctx: ClientContext;
  init: InitializeResponse;
  /** Raw params of every `_auth/status_update` notification received. */
  authUpdates: unknown[];
  /** Raw params of every `session/request_permission` request received. */
  permissionRequests: RequestPermissionRequest[];
  /** Pid of the adapter process (its direct child is the claude it runs). */
  adapterPid: number | undefined;
  /** The installed claude the adapter was told to run. */
  claudePath: string;
  /** Everything the server wrote to stderr (diagnostics only). */
  stderr(): string;
}

/** `_meta.claudeCode.options` as d-0035 specifies, plus the cheap probe model. */
export function claudeOptionsMeta(
  maxTurns: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    claudeCode: {
      options: {
        settingSources: [],
        strictMcpConfig: true,
        allowDangerouslySkipPermissions: false,
        maxTurns,
        maxBudgetUsd: 0.05,
        model: PROBE_MODEL,
        ...overrides,
      },
    },
  };
}

/** Starts the server, runs `initialize`, calls `body`, then always kills the child. */
export async function withAcp<T>(body: (h: AcpHarness) => Promise<T>): Promise<T> {
  const entry = createRequire(import.meta.url).resolve(
    '@agentclientprotocol/claude-agent-acp/dist/index.js',
  );

  const claudePath = installedClaudePath();
  const child = spawn(process.execPath, [entry], {
    env: childEnv({ CLAUDE_CODE_EXECUTABLE: slashPath(claudePath) }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
  const authUpdates: unknown[] = [];
  const permissionRequests: RequestPermissionRequest[] = [];

  const app = client({ name: 'forge-probe' })
    .onRequest('session/request_permission', (c) => {
      permissionRequests.push(c.params);
      const reject = c.params.options.find((o) => o.kind.startsWith('reject'));

      return reject
        ? { outcome: { outcome: 'selected' as const, optionId: reject.optionId } }
        : { outcome: { outcome: 'cancelled' as const } };
    })
    .onNotification(
      '_auth/status_update',
      (p: unknown) => p,
      (c) => {
        authUpdates.push(c.params);
      },
    );

  const stream = ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
  );

  try {
    return await app.connectWith(stream, async (ctx) => {
      const init = await ctx.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'forge-probe', version: '0.0.0' },
      });

      return body({
        ctx,
        init,
        authUpdates,
        permissionRequests,
        adapterPid: child.pid,
        claudePath,
        stderr: () => stderr,
      });
    });
  } finally {
    child.kill();
  }
}

export interface TurnOutcome {
  text: string;
  stopReason: string;
  /** `sessionUpdate` discriminants seen during the turn, in order. */
  updateKinds: string[];
  /** Raw `session/update` payloads of the turn, in order (for tool_call inspection). */
  updates: Record<string, unknown>[];
}

/** Sends one prompt and collects agent text until the turn stops. */
export async function promptTurn(
  session: ActiveSession,
  text: string,
): Promise<TurnOutcome> {
  const pending = session.prompt(text);
  let out = '';
  const updateKinds: string[] = [];
  const updates: Record<string, unknown>[] = [];
  for (;;) {
    const msg = await session.nextUpdate();
    if (msg.kind === 'stop') {
      await pending;

      return { text: out, stopReason: msg.stopReason, updateKinds, updates };
    }

    updateKinds.push(msg.update.sessionUpdate);
    updates.push(msg.update as unknown as Record<string, unknown>);
    if (msg.update.sessionUpdate === 'agent_message_chunk') {
      const c = msg.update.content;
      if (c.type === 'text') {
        out += c.text;
      }
    }
  }
}
