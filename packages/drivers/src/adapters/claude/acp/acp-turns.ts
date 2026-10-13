/**
 * Prompt-turn loop of one ACP run.
 *
 * Why: a Worker run is a queue of prompts (the task, then follow-ups and interrupt
 *   messages from the Director). Each turn ends with a stop reason or a JSON-RPC error
 *   that must be mapped to a normalised end the engine can act on: finished, rate
 *   limited, cancelled, crashed. An interrupt cancels the current turn on purpose, so
 *   that cancellation must continue with the next queued prompt instead of ending the
 *   run. Usage reported by the adapter is forwarded so budgets see it turn by turn.
 *
 * Exports: runTurns().
 * Depends on: domain/failure-classify, types/claude/acp, types/claude/engine.
 *   IO: ACP requests.
 */

import { classifyRejection, classifyStopReason } from '#/domain/failure-classify.js';
import type { AcpAgent, AcpRunState } from '#/types/claude/acp.types.js';
import type { EngineEnd, EngineSink } from '#/types/claude/engine.types.js';

/** Sends queued prompts one turn at a time until the queue empties or a turn ends the run. */
export async function runTurns(
  ctx: AcpAgent,
  sink: EngineSink,
  state: AcpRunState,
  queue: string[],
  rate: () => string,
  sessionId: string,
): Promise<EngineEnd> {
  for (;;) {
    const next = queue.shift();
    if (next === undefined) {
      return { kind: 'completed' };
    }

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

    if (end.kind !== 'completed') {
      return end;
    }
  }
}
