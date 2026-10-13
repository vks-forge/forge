/**
 * Pins: the pure Claude driver rules: env building, failure classification, result table,
 * pause detection, event and CLI line normalisation.
 *
 * Why: these small functions decide what a Worker's end means to the Director (retry,
 * back off, escalate) and what the harness child inherits. They have no IO, so every row
 * is pinned here directly, independent of any engine.
 *
 * Depends on: src/domain/*, src/schemas/*, src/shared/event-log.
 */

import { describe, expect, it } from 'vitest';
import { normaliseAcpUpdate } from '#/domain/acp-events.js';
import { buildChildEnv } from '#/domain/child-env.js';
import { buildCliArgs } from '#/domain/cli-args.js';
import { normaliseCliLine, usageFromResult } from '#/domain/cli-events.js';
import {
  classifyCliResult,
  classifyRejection,
  classifyStopReason,
  classifyText,
  retryNotBeforeFrom,
} from '#/domain/failure-classify.js';
import { findInteractionId, isAskTool } from '#/domain/pending-ask.js';
import { buildRunResult, EFFECTIVE_TABLE } from '#/domain/run-result.js';
import { readClaudeToolName, readRateLimit, readSteering } from '#/schemas/claude-acp.js';
import { parseClaudeConfig } from '#/schemas/claude-config.js';
import { parseCliLine } from '#/schemas/claude-stream-json.js';
import { EventLog } from '#/shared/event-log.js';

const rate = () => '2026-01-01T00:00:00.000Z';
const usage = { in: 1, out: 2, cachedIn: 0, cacheWrite: 0 };

describe('buildChildEnv', () => {
  it('layers sources, drops undefined and strips nesting vars case-insensitively', () => {
    const env = buildChildEnv(
      { PATH: 'p', claudecode: '1', GONE: undefined },
      { A: 'req', CLAUDE_CODE_ENTRYPOINT: 'x' },
      { A: 'prepared', FORGE_HOOK_CONFIG: '/x' },
    );

    expect(env).toEqual({ PATH: 'p', A: 'prepared' });
  });
});

describe('classification', () => {
  it('maps stop reasons', () => {
    expect(classifyStopReason('end_turn', null, rate).kind).toBe('completed');
    expect(classifyStopReason('max_turn_requests', null, rate).kind).toBe('max_turns');
    expect(classifyStopReason('refusal', null, rate).kind).toBe('refused');
    expect(classifyStopReason('cancelled', null, rate).kind).toBe('cancelled');
    expect(classifyStopReason('max_tokens', null, rate).kind).toBe('unknown');
    expect(classifyStopReason('end_turn', { status: 'rejected' }, rate).kind).toBe(
      'rate_limit',
    );
  });

  it('maps rejections by code, errorKind, rate state and text', () => {
    const err = (message: string, data?: unknown, code = -32603) => ({
      code,
      message,
      data,
    });

    const kind = (e: unknown, r = null as { status?: string } | null) =>
      classifyRejection(e, r, rate).kind;

    expect(kind(err('x', undefined, -32000))).toBe('auth');
    expect(kind(err('x', { errorKind: 'authentication_failed' }))).toBe('auth');
    expect(kind(err('x', { errorKind: 'rate_limit' }))).toBe('rate_limit');
    expect(kind(err('x', { errorKind: 'billing_error' }))).toBe('budget');
    expect(kind(err('x'), { status: 'rejected' })).toBe('rate_limit');
    expect(kind(err('weird'))).toBe('unknown');
    expect(kind('plain string')).toBe('unknown');
  });

  it('classifies text', () => {
    expect(classifyText('error_max_budget_usd', rate).kind).toBe('budget');
    expect(classifyText('Please run /login', rate).kind).toBe('auth');
    expect(classifyText('violates our usage policy', rate).kind).toBe('refused');
  });

  it('classifies CLI results by subtype, status code and text', () => {
    const r = (o: object) => classifyCliResult({ type: 'result', ...o }, rate).kind;
    expect(r({ subtype: 'success', is_error: false })).toBe('completed');
    expect(r({ subtype: 'error_max_budget_usd' })).toBe('budget');
    expect(r({ subtype: 'error_max_turns' })).toBe('max_turns');
    expect(r({ api_error_status: 429 })).toBe('rate_limit');
    expect(r({ api_error_status: 401 })).toBe('auth');
    expect(r({ stop_reason: 'refusal' })).toBe('refused');
    expect(r({ subtype: 'success', result: 'This violates our usage policy.' })).toBe(
      'refused',
    );

    expect(r({ subtype: 'error_during_execution', is_error: true })).toBe('crash');
    expect(
      r({ subtype: 'error_during_execution', is_error: true, errors: ['overloaded'] }),
    ).toBe('rate_limit');
  });

  it('computes retryNotBefore from the reset or the fallback', () => {
    expect(retryNotBeforeFrom({ resetsAt: 2_000_000_000 }, 0, 5)).toBe(
      new Date(2_000_000_000_000).toISOString(),
    );

    expect(retryNotBeforeFrom({ resetsAt: 1 }, 1_000_000, 5_000)).toBe(
      new Date(1_005_000).toISOString(),
    );

    expect(retryNotBeforeFrom(null, 0, 5_000)).toBe(new Date(5_000).toISOString());
  });
});

describe('buildRunResult', () => {
  const base = {
    session: 's',
    usage,
    costUsd: 0.1,
    filesTouched: ['a'],
    pendingAsk: null,
  };

  it('covers every table row', () => {
    for (const [kind, row] of Object.entries(EFFECTIVE_TABLE)) {
      const isEnd = !['stall', 'turn_timeout'].includes(kind);
      const res = buildRunResult({
        ...base,
        end: { kind: isEnd ? (kind as 'completed') : 'completed' },
        override: isEnd ? null : { kind: kind as 'stall', detail: 'd' },
      });

      expect(res.status).toBe(row.status);
      expect(res.errorFamily).toBe(row.family);
    }
  });

  it('lets an override beat the engine end; only rate limits carry retryNotBefore', () => {
    const o = buildRunResult({
      ...base,
      end: { kind: 'crash' },
      override: { kind: 'cancelled', detail: '' },
    });

    expect(o.status).toBe('cancelled');
    const r = buildRunResult({
      ...base,
      end: { kind: 'rate_limit', retryNotBefore: rate() },
      override: null,
    });

    expect(r.retryNotBefore).toBe(rate());
  });

  it('pauses only a completed run with an open interaction', () => {
    expect(
      buildRunResult({
        ...base,
        end: { kind: 'completed' },
        override: null,
        pendingAsk: 'i1',
      }),
    ).toMatchObject({ status: 'paused', interactionId: 'i1' });

    expect(
      buildRunResult({
        ...base,
        end: { kind: 'crash' },
        override: null,
        pendingAsk: 'i1',
      }).status,
    ).toBe('error');
  });
});

describe('pending ask', () => {
  it('recognises the run own ask tools and finds ids in any wrapping', () => {
    expect(isAskTool('mcp__forge__ask_director', 'forge')).toBe(true);
    expect(isAskTool('mcp__forge__report_blocked', 'forge')).toBe(true);
    expect(isAskTool('mcp__other__ask_director', 'forge')).toBe(false);
    expect(findInteractionId('{"interaction_id":"a"}')).toBe('a');
    expect(findInteractionId([{ content: { text: '{"interaction_id":"b"}' } }])).toBe(
      'b',
    );

    expect(findInteractionId({ x: { interaction_id: 'c' } })).toBe('c');
    expect(findInteractionId('plain')).toBeNull();
    expect(findInteractionId('{bad')).toBeNull();
    expect(findInteractionId(null)).toBeNull();
  });
});

describe('normalisation', () => {
  it('reads ACP metadata leniently', () => {
    expect(readRateLimit({ '_claude/rateLimit': { status: 'rejected' } })?.status).toBe(
      'rejected',
    );

    expect(readRateLimit('x')).toBeNull();
    expect(readSteering({ steering: { supported: true } })).toBe(true);
    expect(readSteering(null)).toBe(false);
    expect(readClaudeToolName({ claudeCode: { toolName: 'T' } })).toBe('T');
  });

  it('drops empty text and unknown ACP updates; the title is the last-resort name', () => {
    expect(
      normaliseAcpUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '' },
      }).events,
    ).toEqual([]);

    expect(normaliseAcpUpdate({ sessionUpdate: 'plan', entries: [] }).dropped).toBe(
      'plan',
    );

    const n = normaliseAcpUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 't',
      title: 'Run it',
      status: 'failed',
    });

    expect(n.events.map((e) => e.type)).toEqual(['tool_call', 'tool_result']);
    expect(n.events[0]).toMatchObject({ name: 'Run it' });
  });

  it('parses CLI lines and totals usage with a model breakdown', () => {
    expect(parseCliLine('')).toBeNull();
    expect(parseCliLine('{bad')).toBeNull();
    const limit = parseCliLine(
      JSON.stringify({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected' },
      }),
    );

    expect(normaliseCliLine(limit!).rateLimit?.status).toBe('rejected');
    const res = parseCliLine(
      JSON.stringify({
        type: 'result',
        usage: { input_tokens: 3 },
        modelUsage: { m: { inputTokens: 1, outputTokens: 2 } },
      }),
    );

    expect(usageFromResult(normaliseCliLine(res!).result!)).toMatchObject({
      in: 3,
      out: 0,
      byModel: { m: { in: 1, out: 2 } },
    });
  });

  it('builds CLI args without optional flags by default', () => {
    const args = buildCliArgs(
      { budget: { maxTurns: 1, maxUsd: 1, stallMs: 1, turnMs: 1 }, model: 'm' } as never,
      { settingsPath: 's', hookConfigPath: 'h', mcpConfigPath: 'm' },
      undefined,
    );

    expect(args).not.toContain('--allowedTools');
    expect(args).not.toContain('--resume');
  });
});

describe('config and event log', () => {
  it('fills defaults and rejects bad values', () => {
    expect(parseClaudeConfig(undefined)).toMatchObject({
      engine: 'acp',
      receiptGraceMs: 3000,
    });

    expect(() => parseClaudeConfig({ engine: 'x' })).toThrow();
  });

  it('replays, waits for new items and ends on close', async () => {
    const log = new EventLog<number>();
    log.push(1);
    const seen: number[] = [];
    const done = (async () => {
      for await (const n of log.iterate()) {
        seen.push(n);
      }
    })();

    log.push(2);
    log.close();
    log.push(3);
    await done;
    expect(seen).toEqual([1, 2]);
    expect(log.snapshot()).toEqual([1, 2]);
  });
});
