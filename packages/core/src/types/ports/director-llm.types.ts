/**
 * DirectorLLM port — the finite, schema-checked model calls the Director makes.
 *
 * Why: the Director is deterministic code that asks a model for judgement in small steps
 *   (triage, dispatch_prompt, steer_reply). Which model, which harness or API key sits
 *   behind a step must not leak into the engine, and a bad answer must come back as a typed
 *   value the engine can retry once or reject, never as a half-parsed object it writes to a
 *   ticket. The port takes the step name, the input, the zod schema the answer is held to
 *   and per-call model and budget, and returns a Result whose error carries the failure
 *   family so retry and park decisions read the family, not message text
 *   (director-core.md §5, d-0032, d-0003).
 *
 * Exports: StepErrorKind, StepError, StepOptions, DirectorLLMCapabilities, DirectorLLM.
 * Depends on: schemas/errors, schemas/steps, types/result. Types only.
 */

import type { ZodType } from 'zod';
import type { ErrorFamily } from '#/schemas/errors.js';
import type { StepName } from '#/schemas/steps.js';
import type { Result } from '#/types/result.types.js';

/** `invalid_output` is the model answering off-schema (retryable once); everything else is an {@link ErrorFamily}. */
export type StepErrorKind = 'invalid_output' | ErrorFamily;

/** Why a step produced no value; `retryNotBefore` is set for a rate limit that named a reset time. */
export interface StepError {
  readonly kind: StepErrorKind;
  readonly message: string;
  readonly retryNotBefore?: string;
}

/** Per-call knobs: the model alias from the matrix and a hard spend cap for this one call. */
export interface StepOptions {
  readonly model: string;
  readonly budgetUsd: number;
  /** How long this call may run before it is killed and reported as a stall; the adapter's default when absent (d-0141 item 4). */
  readonly timeoutMs?: number;
  /** Called once with the dollars the call cost when the model reports it, so the card can count its Director spend (d-0143). */
  readonly onCost?: (usd: number) => void;
}

/** What an implementation declares, so the engine never guesses from a name. */
export interface DirectorLLMCapabilities {
  readonly structuredOutput: boolean;
  readonly reportsCost: boolean;
}

/** One finite LLM call: input in, schema-validated output or a typed {@link StepError} out. Never throws for a model failure. */
export interface DirectorLLM {
  capabilities(): DirectorLLMCapabilities;
  step<T>(
    name: StepName,
    input: unknown,
    outputSchema: ZodType<T>,
    opts: StepOptions,
  ): Promise<Result<T, StepError>>;
}
