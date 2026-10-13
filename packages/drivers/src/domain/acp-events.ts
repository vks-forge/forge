/**
 * Normalises ACP `session/update` notifications into Forge run events.
 *
 * Why: the Director, storage and control room speak `RunEvent`, never ACP. The adapter
 *   streams message chunks, tool calls, tool updates, plans, mode changes and usage in its
 *   own vocabulary, and new update kinds appear with adapter versions. This translation
 *   keeps only what Forge uses (assistant text, tool calls and their results, spend and the
 *   rate-limit state) and drops the rest with a note for the debug log. Dropping instead of
 *   throwing is deliberate: an update kind the driver has never seen must not crash a run
 *   that is otherwise healthy. Tool names come from the adapter's `name` (or its
 *   `_meta.claudeCode.toolName`) because the receipt cross-check and the pause detection
 *   both key on the harness-native name.
 *
 * Exports: normaliseAcpUpdate().
 * Depends on: @agentclientprotocol/sdk (types), schemas/claude-acp, types/claude/engine.
 *   No IO.
 */

import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { readClaudeToolName, readRateLimit } from '#/schemas/claude-acp.js';
import type { AcpNormalised } from '#/types/claude/normalised.types.js';
import type { EventDraft } from '#/types/claude/engine.types.js';

const KEPT_STATUSES = new Set(['completed', 'failed']);

function toolName(u: {
  name?: string | null;
  title?: string | null;
  _meta?: unknown;
}): string {
  return u.name || readClaudeToolName(u._meta) || u.title || 'unknown';
}

function resultOf(u: {
  toolCallId: string;
  status?: string | null;
  rawOutput?: unknown;
  content?: unknown;
}): EventDraft {
  return {
    type: 'tool_result',
    call_id: u.toolCallId,
    output: u.rawOutput ?? u.content ?? null,
    is_error: u.status === 'failed',
  };
}

/** One update to zero or more events plus the side signals the engine tracks. */
export function normaliseAcpUpdate(update: SessionUpdate): AcpNormalised {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const c = update.content;

      return c.type === 'text' && c.text.length > 0
        ? { events: [{ type: 'text', text: c.text }] }
        : { events: [] };
    }

    case 'tool_call': {
      const call: EventDraft = {
        type: 'tool_call',
        call_id: update.toolCallId,
        name: toolName(update),
        input: update.rawInput ?? {},
      };

      return {
        events:
          update.status && KEPT_STATUSES.has(update.status)
            ? [call, resultOf(update)]
            : [call],
      };
    }

    case 'tool_call_update':
      return {
        events:
          update.status && KEPT_STATUSES.has(update.status) ? [resultOf(update)] : [],
      };
    case 'usage_update': {
      const rateLimit = readRateLimit(update._meta);
      const cost = update.cost;

      return {
        events: [],
        ...(cost && cost.currency === 'USD' ? { costUsd: cost.amount } : {}),
        ...(rateLimit ? { rateLimit } : {}),
      };
    }

    default:
      return { events: [], dropped: update.sessionUpdate };
  }
}
