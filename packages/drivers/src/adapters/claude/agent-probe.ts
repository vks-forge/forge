/**
 * One tool-less model call that shows an agent's model and instructions work.
 *
 * Why: before trusting an agent with a ticket the owner wants to see it answer. The probe
 *   asks the installed `claude` for one short reply with the agent's instructions as the
 *   system prompt and the agent's model, and nothing else: `--tools ''` so it cannot touch
 *   anything, `--setting-sources ''` so no project or user settings leak in, no session saved,
 *   and a hard dollar cap from the caller. Every way it can end becomes a value with an error
 *   family (auth, quota, budget, stall...) so the screen can say what happened in plain words
 *   and the owner never sees a thrown error from a button. The credential goes into the child
 *   only and never into the result.
 *
 * Exports: probeClaude().
 * Depends on: @forge/core (AuthError, types), adapters/claude/capture-output, domain/child-env,
 *   domain/director-step-result, domain/failure-classify, types/claude/{harness,probe}.
 *   IO: spawns one short-lived `claude`.
 */

import { AuthError } from '@forge/core';
import type { AgentProbeRequest, AgentProbeResult, ErrorFamily } from '@forge/core';
import { captureOutput } from '#/adapters/claude/capture-output.js';
import { buildChildEnv } from '#/domain/child-env.js';
import { parseCliOutput } from '#/domain/director-step-result.js';
import { classifyCliResult, retryNotBeforeFrom } from '#/domain/failure-classify.js';
import type { EngineEndKind } from '#/types/claude/engine.types.js';
import type { ResolvedHarness } from '#/types/claude/harness.types.js';
import type { ProbeDeps } from '#/types/claude/probe.types.js';

const DEFAULT_BACKOFF_MS = 60_000;

const FAMILY: Partial<Record<EngineEndKind, ErrorFamily>> = {
  refused: 'refusal',
  budget: 'budget',
  max_turns: 'budget',
  rate_limit: 'rate_limit',
  quota: 'quota',
  auth: 'auth',
  crash: 'crash',
  policy_denied: 'policy_denied',
};

/** The argument list: tool-less, settings-less, session-less, capped. */
export function probeArgs(req: AgentProbeRequest): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--tools',
    '',
    '--setting-sources',
    '',
    '--no-session-persistence',
    '--max-budget-usd',
    String(req.maxUsd),
    ...(req.model ? ['--model', req.model] : []),
    ...(req.instructions.trim() === ''
      ? []
      : ['--append-system-prompt', req.instructions]),
  ];
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Runs the probe and always returns a result; nothing here throws for a model or harness failure. */
export async function probeClaude(
  deps: ProbeDeps,
  req: AgentProbeRequest,
): Promise<AgentProbeResult> {
  const started = deps.clock.now();
  const done = (r: Omit<AgentProbeResult, 'durationMs'>): AgentProbeResult => ({
    ...r,
    durationMs: Math.max(0, deps.clock.now() - started),
  });

  let harness: ResolvedHarness;
  try {
    harness = await deps.resolver.forRun();
  } catch (e) {
    return done({
      ok: false,
      error: {
        family: e instanceof AuthError ? 'auth' : 'crash',
        message: messageOf(e),
      },
    });
  }

  const env = buildChildEnv(deps.baseEnv, {}, {}, harness.authEnv);
  const out = await captureOutput(
    deps.spawn,
    deps.clock,
    harness.binaryPath,
    probeArgs(req),
    env,
    { stdin: req.prompt, timeoutMs: req.timeoutMs },
  );

  if (out === null) {
    return done({
      ok: false,
      error: {
        family: 'stall',
        message: `the harness did not answer within ${Math.round(req.timeoutMs / 1000)} seconds`,
      },
    });
  }

  const { result, rateLimit } = parseCliOutput(out);
  if (result === null) {
    return done({
      ok: false,
      error: { family: 'crash', message: 'the harness ended without a result' },
    });
  }

  const rate = (): string =>
    retryNotBeforeFrom(rateLimit, deps.clock.now(), deps.backoffMs ?? DEFAULT_BACKOFF_MS);

  const end = classifyCliResult(result, rate);
  const cost = result.total_cost_usd;
  const modelUsed = Object.keys(result.modelUsage ?? {})[0];
  const shared = {
    ...(cost === undefined ? {} : { costUsd: cost }),
    ...(modelUsed === undefined ? {} : { modelUsed }),
  };

  if (end.kind !== 'completed') {
    return done({
      ok: false,
      ...shared,
      error: {
        family: FAMILY[end.kind] ?? 'unknown',
        message: end.detail || `the harness ended with ${result.subtype ?? 'an error'}`,
      },
    });
  }

  return done({ ok: true, ...shared, reply: (result.result ?? '').trim() });
}
