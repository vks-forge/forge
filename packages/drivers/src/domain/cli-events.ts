/**
 * Normalises `claude -p` stream-json lines into Forge run events.
 *
 * Why: the CLI engine hears the run only as lines on stdout. Assistant lines carry text and
 *   tool calls, user lines carry tool results, a `system` line carries the session id the
 *   next `--resume` needs, and the `result` line decides how the run ended. This pure
 *   translation turns one parsed line into events and the side signals the engine tracks
 *   (session, rate-limit state, the result line) so the same rules the ACP engine applies
 *   (receipt cross-check, pause detection, result table) work on top of it unchanged.
 *   Unknown line types and blocks are ignored, never an error.
 *
 * Exports: normaliseCliLine(), usageFromResult().
 * Depends on: schemas/claude-stream-json, types/claude/engine, @forge/core (UsageReport).
 *   No IO.
 */

import type { UsageReport } from '@forge/core';
import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { CliLine, CliResultLine } from '#/schemas/claude-stream-json.js';
import type { CliNormalised } from '#/types/claude/normalised.types.js';
import type { EventDraft } from '#/types/claude/engine.types.js';

function blocksOf(message: { content: unknown }): readonly Record<string, unknown>[] {
  return Array.isArray(message.content)
    ? (message.content as Record<string, unknown>[])
    : [];
}

/** One parsed line to events and side signals. */
export function normaliseCliLine(line: CliLine): CliNormalised {
  const session =
    'session_id' in line && typeof line.session_id === 'string'
      ? { session: line.session_id }
      : {};

  switch (line.type) {
    case 'assistant': {
      const events: EventDraft[] = [];
      for (const b of blocksOf((line as { message: { content: unknown } }).message)) {
        if (b['type'] === 'text' && typeof b['text'] === 'string' && b['text']) {
          events.push({ type: 'text', text: b['text'] });
        }

        if (b['type'] === 'tool_use' && typeof b['id'] === 'string') {
          events.push({
            type: 'tool_call',
            call_id: b['id'],
            name: typeof b['name'] === 'string' ? b['name'] : 'unknown',
            input: b['input'] ?? {},
          });
        }
      }

      return { events, ...session };
    }

    case 'user': {
      const events: EventDraft[] = [];
      for (const b of blocksOf((line as { message: { content: unknown } }).message)) {
        if (b['type'] === 'tool_result' && typeof b['tool_use_id'] === 'string') {
          events.push({
            type: 'tool_result',
            call_id: b['tool_use_id'],
            output: b['content'] ?? null,
            is_error: b['is_error'] === true,
          });
        }
      }

      return { events, ...session };
    }

    case 'rate_limit_event': {
      const info = (line as { rate_limit_info?: RateLimitInfo }).rate_limit_info;

      return { events: [], ...(info ? { rateLimit: info } : {}) };
    }

    case 'result':
      return { events: [], ...session, result: line as CliResultLine };
    default:
      return { events: [], ...session };
  }
}

/** Token totals from a result line, with a per-model breakdown when the CLI gave one. */
export function usageFromResult(r: CliResultLine): UsageReport {
  const u = r.usage;
  const byModel = r.modelUsage
    ? Object.fromEntries(
        Object.entries(r.modelUsage).map(([model, m]) => [
          model,
          {
            in: m.inputTokens ?? 0,
            out: m.outputTokens ?? 0,
            cachedIn: m.cacheReadInputTokens ?? 0,
            cacheWrite: m.cacheCreationInputTokens ?? 0,
          },
        ]),
      )
    : undefined;

  return {
    in: u?.input_tokens ?? 0,
    out: u?.output_tokens ?? 0,
    cachedIn: u?.cache_read_input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
    ...(byModel ? { byModel } : {}),
  };
}
