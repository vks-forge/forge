/**
 * Turns the document `claude -p --output-format json` printed into a typed step result.
 *
 * Why: the Director acts on the answer alone, so every way the call can end must become one
 *   `StepError` kind it can retry, back off on, park or reject, and a malformed or missing
 *   document must never be read as success. The CLI prints either one result object or an
 *   array of messages (the result is the last `result` element), a budget stop can exit 0
 *   with no result text and a success can exit non-zero (d-0057), so the document's
 *   `subtype` decides and the exit code is never read. The answer comes from
 *   `structured_output` when the harness filled it, else from the result string (which a
 *   model may wrap in a code fence), and is validated against the step's schema.
 *
 * Exports: extractJsonText(), parseCliOutput(), interpretOutput().
 * Depends on: zod, @forge/core (ok, err, StepError, Result), domain/failure-classify,
 *   schemas/claude-acp, schemas/claude-stream-json, types/claude/engine. No IO.
 */

import { err, ok } from '@forge/core';
import type { Result, StepError } from '@forge/core';
import { z } from 'zod';
import type { ZodType } from 'zod';
import {
  classifyCliResult,
  classifyText,
  retryNotBeforeFrom,
} from '#/domain/failure-classify.js';
import { RateLimitInfo } from '#/schemas/claude-acp.js';
import { CliResultLine } from '#/schemas/claude-stream-json.js';
import type { StepContext, StepOutput } from '#/types/claude/director-step.types.js';
import type { EngineEnd } from '#/types/claude/engine.types.js';

/** A model reply as JSON text: trims, and unwraps one surrounding ``` fence. */
export function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);

  return fenced?.[1] === undefined ? trimmed : fenced[1].trim();
}

function documentItems(stdout: string): unknown[] {
  const text = stdout.trim();
  const flatten = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
  try {
    return flatten(JSON.parse(text));
  } catch {
    // Not one document: tolerate warnings around JSON lines and read what parses.
    const items: unknown[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line.startsWith('{') && !line.startsWith('[')) {
        continue;
      }

      try {
        items.push(...flatten(JSON.parse(line)));
      } catch {
        // skip a broken line
      }
    }

    return items;
  }
}

/** The last `result` object and the last rate-limit report in `stdout`, lenient about shape. */
export function parseCliOutput(stdout: string): StepOutput {
  let result: CliResultLine | null = null;
  let rateLimit: RateLimitInfo | null = null;
  for (const item of documentItems(stdout)) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const type = (item as { type?: unknown }).type;
    if (type === 'result') {
      const parsed = CliResultLine.safeParse(item);
      if (parsed.success) {
        result = parsed.data;
      }
    } else if (type === 'rate_limit_event') {
      const info = RateLimitInfo.safeParse(
        (item as { rate_limit_info?: unknown }).rate_limit_info,
      );

      if (info.success) {
        rateLimit = info.data;
      }
    }
  }

  return { result, rateLimit };
}

function toStepError(end: EngineEnd, message: string): StepError {
  switch (end.kind) {
    case 'refused':
      return { kind: 'refusal', message };
    case 'budget':
    case 'max_turns':
      return { kind: 'budget', message };
    case 'rate_limit':
      return {
        kind: 'rate_limit',
        message,
        ...(end.retryNotBefore ? { retryNotBefore: end.retryNotBefore } : {}),
      };
    case 'auth':
      return { kind: 'auth', message };
    case 'crash':
      return { kind: 'crash', message };
    default:
      return { kind: 'unknown', message };
  }
}

function parseAnswer<T>(result: CliResultLine, schema: ZodType<T>): Result<T, StepError> {
  let candidate: unknown = result.structured_output;
  if (candidate === undefined || candidate === null) {
    const text = extractJsonText(result.result ?? '');
    try {
      candidate = JSON.parse(text);
    } catch {
      return err({
        kind: 'invalid_output',
        message: `the reply is not valid JSON: ${text.slice(0, 200) || '(empty)'}`,
      });
    }
  }

  const parsed = schema.safeParse(candidate);

  return parsed.success
    ? ok(parsed.data)
    : err({ kind: 'invalid_output', message: z.prettifyError(parsed.error) });
}

/** Classifies how the call ended and, on completion, validates the answer against `schema`. */
export function interpretOutput<T>(
  output: StepOutput,
  schema: ZodType<T>,
  ctx: StepContext,
): Result<T, StepError> {
  const rate = (): string =>
    retryNotBeforeFrom(output.rateLimit, ctx.nowMs, ctx.backoffMs);

  const rejected = output.rateLimit?.status === 'rejected';
  const { result } = output;
  if (result === null) {
    const detail = ctx.exit
      ? `claude ended (${ctx.exit}) without a result`
      : 'claude ended without a result';

    const message = `${detail}: ${ctx.tail}`.trim();
    if (rejected) {
      return err(toStepError({ kind: 'rate_limit', retryNotBefore: rate() }, message));
    }

    const end = classifyText(ctx.tail, rate);

    return err(toStepError(end.kind === 'unknown' ? { kind: 'crash' } : end, message));
  }

  let end = classifyCliResult(result, rate);
  if ((end.kind === 'unknown' || end.kind === 'crash') && rejected) {
    end = { kind: 'rate_limit', retryNotBefore: rate() };
  }

  if (end.kind === 'completed') {
    return parseAnswer(result, schema);
  }

  const message = end.detail || `claude ended with ${result.subtype ?? 'an error'}`;

  return err(toStepError(end, message));
}
