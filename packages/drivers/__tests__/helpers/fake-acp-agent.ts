/**
 * In-process fake ACP agent (the adapter's side of the protocol) for engine tests.
 *
 * Why: the ACP engine's rules (auth wait, set_mode after new and load, permission answers,
 *   steering, cancel) are about what it sends and how it reacts to what the adapter sends
 *   back. A real adapter would spend money and cannot be told to rate-limit on demand. This
 *   fake speaks the real protocol through the SDK's agent side over in-memory streams,
 *   records every call it receives, and lets a test script the adapter's behaviour per
 *   prompt: stream updates, ask for permission, end with any stop reason, or reject with
 *   the JSON-RPC error shapes the real adapter uses.
 *
 * Exports: FakeAcpOptions, PromptContext, PromptOutcome, FakeAcp, createFakeAcp().
 * Depends on: @agentclientprotocol/sdk, helpers/fake-child, node:stream. No IO.
 */

import { Readable, Writable } from 'node:stream';
import {
  agent,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
} from '@agentclientprotocol/sdk';
import type {
  PromptResponse,
  RequestPermissionResponse,
  SessionUpdate,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import { createFakeChild } from '#tests/helpers/fake-child.js';
import type { FakeChild } from '#tests/helpers/fake-child.js';

export interface PromptContext {
  readonly sessionId: string;
  readonly text: string;
  readonly turn: number;
  update(update: SessionUpdate): Promise<void>;
  /** Sends `session/request_permission` the way the adapter does; resolves with the client's answer. */
  permission(toolCall: ToolCallUpdate): Promise<RequestPermissionResponse>;
  /** Resolves when the client sent `session/cancel`. */
  readonly cancelled: Promise<void>;
  /** Sends the rate-limit usage update the adapter emits. */
  rateLimit(info: Record<string, unknown>): Promise<void>;
}

export type PromptOutcome = PromptResponse | RequestError;

export interface FakeAcpOptions {
  /** `_auth/status_update` kind to push after initialize; 'silent' never sends one. */
  auth?: 'account' | 'none' | 'silent';
  steering?: boolean;
  failSetMode?: boolean;
  /** How the adapter handles one prompt; default streams "done" and ends the turn. */
  onPrompt?: (ctx: PromptContext) => Promise<PromptOutcome>;
}

export interface FakeAcp {
  readonly child: FakeChild;
  /** Every request and notification the client sent, in order. */
  readonly calls: { method: string; params: unknown }[];
  readonly methods: () => string[];
  readonly paramsOf: (method: string) => unknown[];
  /** Pushes an arbitrary notification to the client. */
  push(update: SessionUpdate): Promise<void>;
}

const OPTIONS = [
  { optionId: 'allow-once', name: 'Yes', kind: 'allow_once' as const },
  { optionId: 'reject', name: 'No', kind: 'reject_once' as const },
];

export function createFakeAcp(opts: FakeAcpOptions = {}): FakeAcp {
  const child = createFakeChild();
  const calls: FakeAcp['calls'] = [];
  const record = (method: string, params: unknown): void => {
    calls.push({ method, params });
  };
  let sessionId = 'sess-1';
  let turn = 0;
  let cancelNow: () => void = () => undefined;
  let cancelled = new Promise<void>((r) => (cancelNow = r));
  let toClient: { notify: (m: string, p: unknown) => Promise<void> } | undefined;

  const send = async (update: SessionUpdate): Promise<void> => {
    await toClient?.notify('session/update', { sessionId, update });
  };

  const app = agent()
    .onRequest('initialize', async (c) => {
      record('initialize', c.params);
      toClient = c.client;
      if (opts.auth !== 'silent')
        setImmediate(() => {
          // The client may already be gone (run killed early): a lost push is fine.
          void c.client
            .notify('_auth/status_update', {
              authStatus: { kind: opts.auth ?? 'account', label: 'fake' },
            })
            .catch(() => undefined);
        });
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
        authMethods: [],
        ...(opts.steering ? { _meta: { steering: { supported: true } } } : {}),
      };
    })
    .onRequest('session/new', (c) => {
      record('session/new', c.params);
      sessionId = 'sess-1';
      return { sessionId };
    })
    .onRequest('session/load', (c) => {
      record('session/load', c.params);
      sessionId = c.params.sessionId;
      return {};
    })
    .onRequest('session/set_mode', (c) => {
      record('session/set_mode', c.params);
      if (opts.failSetMode) throw RequestError.invalidParams(undefined, 'no such mode');
      return {};
    })
    .onNotification('session/cancel', (c) => {
      record('session/cancel', c.params);
      cancelNow();
    })
    .onRequest(
      '_session/steering',
      (p: unknown) => p,
      (c) => {
        record('_session/steering', c.params);
        return { outcome: 'injected' };
      },
    )
    .onRequest('session/prompt', async (c) => {
      record('session/prompt', c.params);
      toClient = c.client;
      const first = c.params.prompt[0];
      const text = first && first.type === 'text' ? first.text : '';
      cancelled = new Promise<void>((r) => (cancelNow = r));
      const ctx: PromptContext = {
        sessionId,
        text,
        turn: turn++,
        update: send,
        permission: (toolCall) =>
          c.client.request('session/request_permission', {
            sessionId,
            toolCall,
            options: OPTIONS,
          }),
        cancelled,
        rateLimit: (info) =>
          send({
            sessionUpdate: 'usage_update',
            used: 1,
            size: 100,
            _meta: { '_claude/rateLimit': info },
          }),
      };
      const run =
        opts.onPrompt ??
        (async (x: PromptContext): Promise<PromptOutcome> => {
          await x.update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'done' },
          });
          return { stopReason: 'end_turn' };
        });
      const outcome = await run(ctx);
      if (outcome instanceof RequestError) throw outcome;
      return outcome;
    });

  app.connect(
    ndJsonStream(
      Writable.toWeb(child.stdoutPipe) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdinPipe) as ReadableStream<Uint8Array>,
    ),
  );

  return {
    child,
    calls,
    methods: () => calls.map((c) => c.method),
    paramsOf: (method) => calls.filter((c) => c.method === method).map((c) => c.params),
    push: send,
  };
}
