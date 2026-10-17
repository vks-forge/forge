/**
 * DirectorLLM decorator for the debug trace: one entry per Director step.
 *
 * Why: when a plan looks wrong or a step fails, the owner needs the step's input, the prompt the
 *   model actually saw, the raw text it printed, what was parsed from it, its cost, duration,
 *   model and harness (d-0163). The prompt and raw text only exist inside the driver, which
 *   reports them through an `onTrace` callback and stays harness-neutral by passing text only.
 *   Steps run concurrently, so the callback cannot just write to a shared variable: each call
 *   runs inside an AsyncLocalStorage context that the callback reads, so a prompt always lands
 *   on the step that sent it. The decorator returns exactly what the wrapped port returned;
 *   a trace failure never changes a step's result.
 *
 * Exports: traceDirectorLLM().
 * Depends on: node:async_hooks, @forge/core (DirectorLLM, TraceSink), @forge/drivers (type only). No IO.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { DirectorLLM, StepName, StepOptions, TraceSink } from '@forge/core';
import type { DirectorStepTrace } from '@forge/drivers';
import type { ZodType } from 'zod';
import type { StepCapture } from '#/types/trace.types.js';

const idOf = (value: unknown): string | undefined =>
  typeof (value as { id?: unknown } | null)?.id === 'string'
    ? (value as { id: string }).id
    : undefined;

/** The card, ticket and project a step's input names, if it names any. */
function subjectOf(input: unknown): {
  card_id?: string;
  ticket_id?: string;
  project?: string;
} {
  const row = (input ?? {}) as Record<string, unknown>;
  const card =
    idOf(row['card']) ??
    (typeof row['card_id'] === 'string' ? row['card_id'] : undefined);

  const ticket =
    idOf(row['ticket']) ??
    (typeof row['ticket_id'] === 'string' ? row['ticket_id'] : undefined);

  const project = typeof row['project'] === 'string' ? row['project'] : undefined;

  return {
    ...(card ? { card_id: card } : {}),
    ...(ticket ? { ticket_id: ticket } : {}),
    ...(project ? { project } : {}),
  };
}

/**
 * Wraps `llm`; hand the returned `onTrace` to the driver so it can report prompts and raw output.
 * A step that never reports (a fake model) still gets an entry, just without prompt and raw.
 */
export function traceDirectorLLM(
  llm: DirectorLLM,
  deps: { trace: TraceSink; harness: string; now: () => number },
): { llm: DirectorLLM; onTrace: (trace: DirectorStepTrace) => void } {
  const context = new AsyncLocalStorage<StepCapture>();

  return {
    onTrace: (trace) => {
      context.getStore()?.seen.push(trace);
    },
    llm: {
      capabilities: () => llm.capabilities(),
      async step<T>(
        name: StepName,
        input: unknown,
        schema: ZodType<T>,
        opts: StepOptions,
      ) {
        const capture: StepCapture = { cost: 0, seen: [] };
        const started = deps.now();
        const result = await context.run(capture, () =>
          llm.step(name, input, schema, {
            ...opts,
            onCost: (usd) => {
              capture.cost += usd;
              opts.onCost?.(usd);
            },
          }),
        );

        try {
          const seen = capture.seen.at(-1);
          deps.trace.emit({
            level: result.ok ? 'info' : 'warn',
            kind: 'director_step',
            step: name,
            ...subjectOf(input),
            actor: 'director',
            message: result.ok
              ? `director step ${name} ok`
              : `director step ${name} failed: ${result.error.kind}`,
            data: {
              input,
              prompt: seen?.prompt,
              raw: seen?.raw,
              exit: seen?.exit,
              ...(seen && !result.ok ? { stderr_tail: seen.tail } : {}),
              ...(result.ok ? { parsed: result.value } : { error: result.error }),
              cost_usd: capture.cost,
              duration_ms: deps.now() - started,
              model: opts.model,
              harness: deps.harness,
              budget_usd: opts.budgetUsd,
              attempts: capture.seen.length,
            },
          });
        } catch {
          // Tracing must never change a step's result.
        }

        return result;
      },
    },
  };
}
