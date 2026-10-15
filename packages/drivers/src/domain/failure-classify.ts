/**
 * Maps harness stop signals and failures onto the engine end kinds.
 *
 * Why: the Director retries, backs off, escalates or gives up by error family, and the
 *   family must not depend on which engine hosted the run. The two engines see the same
 *   failures in different clothes: the ACP adapter rejects `session/prompt` with a
 *   JSON-RPC error (category in `data.errorKind`, detail in the message) or ends it with a
 *   stop reason; the CLI prints a `result` line with a `subtype`, and a budget stop exits 0
 *   with no result text (probe 1). This module is the one place those signals become
 *   `completed | refused | max_turns | budget | rate_limit | auth | ...`, so the result
 *   table of the brief is implemented once and tested without a process. Anything it does
 *   not recognise becomes `unknown`, never `completed` (fail closed). A used-up account
 *   ("The Claude account has no available quota.", a rejected rate-limit report) is `quota`,
 *   not `rate_limit`: a short backoff cannot fix it, so the engine parks the whole harness
 *   until the reset time the harness named (d-0097); a plain 429 stays `rate_limit`.
 *
 * Exports: classifyStopReason(), classifyRejection(), classifyCliResult(), classifyText(),
 *   retryNotBeforeFrom(), quotaEnd(), resetFromText(), AUTH_REQUIRED_CODE.
 * Depends on: schemas/claude-acp, schemas/claude-stream-json, types/claude/engine. No IO.
 */

import { readErrorKind } from '#/schemas/claude-acp.js';
import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { CliResultLine } from '#/schemas/claude-stream-json.js';
import type { EngineEnd } from '#/types/claude/engine.types.js';

/** JSON-RPC code the ACP adapter uses for `authRequired`. */
export const AUTH_REQUIRED_CODE = -32000;

const QUOTA =
  /no available quota|quota (exceeded|exhausted|reached)|out of (extra )?usage|usage limit|hit your .{0,24}limit|limit reached/i;

const RATE = /rate.?limit|\b429\b|overloaded|too many requests/i;
const AUTH =
  /please run \/login|not logged in|unauthori[sz]ed|authentication (failed|error)|invalid api key|\b401\b|oauth token/i;

const BUDGET =
  /error_max_budget_usd|max(imum)? budget|budget.{0,20}(exceeded|exhausted|reached)/i;

const TURNS = /error_max_turns|max(imum)?.?turns?/i;
const REFUSAL =
  /usage policy|violat\w+ (our|the) .{0,20}polic|can(no|')t (help|assist) with that request/i;

/** ISO reset time from a rate-limit report, or `now + fallbackMs` when it names none. */
export function retryNotBeforeFrom(
  info: RateLimitInfo | null,
  nowMs: number,
  fallbackMs: number,
): string {
  const reset = info?.resetsAt;
  const at =
    reset !== undefined && reset * 1000 > nowMs ? reset * 1000 : nowMs + fallbackMs;

  return new Date(at).toISOString();
}

/** ISO time a message names as the quota reset (`resets 2026-10-15T14:20:00Z`, `resets at 1760538000`), or undefined. */
export function resetFromText(text: string): string | undefined {
  const iso =
    /resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)/i.exec(text);

  const isoMs = iso?.[1] === undefined ? Number.NaN : Date.parse(iso[1]);
  if (!Number.isNaN(isoMs)) {
    return new Date(isoMs).toISOString();
  }

  const epoch = /resets?\s+(?:at\s+)?(\d{10})\b/i.exec(text);

  return epoch?.[1] === undefined
    ? undefined
    : new Date(Number(epoch[1]) * 1000).toISOString();
}

/**
 * A quota end. `retryNotBefore` is the reset the harness named (the rate-limit report's
 * `resetsAt`, else a time in the message) and is absent when it named none: the engine then
 * applies its own default wait. A reset already in the past is the engine's to ignore.
 */
export function quotaEnd(
  detail: string,
  info: RateLimitInfo | null,
  text: string = detail,
): EngineEnd {
  const fromInfo =
    info?.resetsAt === undefined
      ? undefined
      : new Date(info.resetsAt * 1000).toISOString();

  const reset = fromInfo ?? resetFromText(text);

  return { kind: 'quota', detail, ...(reset ? { retryNotBefore: reset } : {}) };
}

/** Message-text classification shared by both engines; `unknown` when nothing matches. */
export function classifyText(text: string, rate: () => string): EngineEnd {
  if (BUDGET.test(text)) {
    return { kind: 'budget', detail: text };
  }

  if (QUOTA.test(text)) {
    return quotaEnd(text, null);
  }

  if (TURNS.test(text)) {
    return { kind: 'max_turns', detail: text };
  }

  if (RATE.test(text)) {
    return { kind: 'rate_limit', detail: text, retryNotBefore: rate() };
  }

  if (AUTH.test(text)) {
    return { kind: 'auth', detail: text };
  }

  if (REFUSAL.test(text)) {
    return { kind: 'refused', detail: text };
  }

  return { kind: 'unknown', detail: text };
}

/** ACP `PromptResponse.stopReason` to an end; a rejected rate-limit state wins over `end_turn`. */
export function classifyStopReason(
  stopReason: string,
  rateLimit: RateLimitInfo | null,
): EngineEnd {
  if (rateLimit?.status === 'rejected') {
    return quotaEnd('rate limit rejected', rateLimit);
  }

  switch (stopReason) {
    case 'end_turn':
      return { kind: 'completed' };
    case 'max_turn_requests':
      return { kind: 'max_turns', detail: stopReason };
    case 'refusal':
      return { kind: 'refused', detail: stopReason };
    case 'cancelled':
      return { kind: 'cancelled' };
    default:
      return { kind: 'unknown', detail: `stopReason ${stopReason}` };
  }
}

const KIND_AUTH = new Set(['authentication_failed', 'oauth_org_not_allowed']);

/** A rejected ACP `session/prompt` (JSON-RPC error) to an end. */
export function classifyRejection(
  error: unknown,
  rateLimit: RateLimitInfo | null,
  rate: () => string,
): EngineEnd {
  const e = error as { code?: unknown; message?: unknown; data?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : String(error);
  if (e?.code === AUTH_REQUIRED_CODE) {
    return { kind: 'auth', detail: message };
  }

  const kind = readErrorKind(e?.data);
  if (kind !== undefined) {
    if (KIND_AUTH.has(kind)) {
      return { kind: 'auth', detail: message };
    }

    if (kind === 'rate_limit') {
      return QUOTA.test(message)
        ? quotaEnd(message, rateLimit)
        : { kind: 'rate_limit', detail: message, retryNotBefore: rate() };
    }

    if (kind === 'billing_error') {
      return { kind: 'budget', detail: message };
    }
  }

  if (rateLimit?.status === 'rejected') {
    return quotaEnd(message, rateLimit);
  }

  return classifyText(message, rate);
}

/** The CLI's final `result` line to an end. The exit code is ignored: a budget stop exits 0. */
export function classifyCliResult(r: CliResultLine, rate: () => string): EngineEnd {
  if (r.subtype === 'error_max_budget_usd') {
    return { kind: 'budget', detail: r.errors?.join('; ') || r.subtype };
  }

  if (r.subtype === 'error_max_turns') {
    return { kind: 'max_turns', detail: r.errors?.join('; ') || r.subtype };
  }

  const text = r.result ?? r.errors?.join('; ') ?? r.subtype ?? '';
  if (r.api_error_status === 429) {
    return QUOTA.test(text)
      ? quotaEnd(text, null)
      : { kind: 'rate_limit', detail: text, retryNotBefore: rate() };
  }

  if (r.api_error_status === 401 || r.api_error_status === 403) {
    return { kind: 'auth', detail: text };
  }

  if (r.stop_reason === 'refusal') {
    return { kind: 'refused', detail: text || 'refusal' };
  }

  if (r.is_error !== true && r.subtype === 'success') {
    return REFUSAL.test(text) && text.length < 400
      ? { kind: 'refused', detail: text }
      : { kind: 'completed' };
  }

  const end = classifyText(text, rate);

  return end.kind === 'unknown' && r.subtype === 'error_during_execution'
    ? { kind: 'crash', detail: text || r.subtype }
    : end;
}
