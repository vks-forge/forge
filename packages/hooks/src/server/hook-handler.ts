/**
 * Server-side hook handler: token check, `admit()`, and the signed receipt chain.
 *
 * Why: the hook script runs inside the Worker's harness and is untrusted, so everything
 *   that matters happens here, in the Forge server. For each event it checks the run's
 *   bearer token in constant time, asks the one `admit()` door for a verdict using the
 *   run's own grant, and appends an HMAC'd receipt chained to the previous one. `seq` is
 *   derived from the chain tail, never from the client, so twenty concurrent posts still
 *   produce one gap-free chain. Every failure (unknown run, wrong token, bad request,
 *   thrown error) answers `deny` with `fail_closed_<code>` and writes nothing to the
 *   chain; a refusal on a real run goes to a rate-limited audit side channel, so a Worker
 *   guessing tokens leaves a trace but can neither get an `allow` nor bloat the signed
 *   chain. An effect receipt is written only for an open decision whose verdict was
 *   `allow`, matched by the harness's own `tool_use_id`: a forged Post cannot launder a
 *   denied or asked call into a recorded effect. Each decision receipt names the
 *   `resource` the call touched, computed by the same `callResource()` resolver `admit()`
 *   uses, so a gate matching a Worker's claim sees the string policy judged. A run that
 *   is no longer active (`isRunActive`: ended, settling, settled) gets no receipts at all,
 *   so a late or replayed post cannot extend a finished run's chain (d-0033,
 *   tool-system.md §10, verification-plane.md §2). When liveness is required, a tool call
 *   from a run whose SessionStart never registered is denied: a harness that skipped one
 *   hook cannot be assumed to run the other (d-0033).
 *
 * Exports: createHookHandler().
 * Depends on: @forge/core (isRunActive), @forge/tools (HookRequest and HookResponse wire
 *   schemas, makeDecisionReceipt, makeEffectReceipt, callResource, constantTimeEqual),
 *   server/tool-resolver, server/audit-gate, shared/args-hash, types/hook-handler.
 */

import { randomUUID } from 'node:crypto';
import { isRunActive } from '@forge/core';
import type { Run } from '@forge/core';
import {
  callResource,
  constantTimeEqual,
  HookRequest,
  makeDecisionReceipt,
  makeEffectReceipt,
} from '@forge/tools';
import type { HookResponse, Receipt } from '@forge/tools';
import { effectStateFor, resolveToolId, toolDefinition } from '#/server/tool-resolver.js';
import { createAuditGate, createMemoryAudit } from '#/server/audit-gate.js';
import { argsHash, resultHash } from '#/shared/args-hash.js';
import type {
  FailClosedCode,
  HookHandler,
  HookHandlerDeps,
  RunCredentials,
} from '#/types/hook-handler.types.js';

const failed = (code: FailClosedCode): HookResponse => ({
  decision: 'deny',
  reason: `fail_closed_${code}`,
  receipt_hash: '',
});

const lastHash = (r: readonly Receipt[]): string => r.at(-1)?.hash ?? '';

/** Builds the pure parts of the handler around the injected dependencies. */
export function createHookHandler(deps: HookHandlerDeps): HookHandler {
  const newId = deps.newId ?? randomUUID;
  const now = (): string => deps.clock().toISOString();

  const audit = createAuditGate(deps.audit ?? createMemoryAudit().sink, deps.clock);

  async function preToolUse(
    run: Run,
    creds: RunCredentials,
    req: Extract<HookRequest, { event: 'PreToolUse' }>,
  ): Promise<HookResponse> {
    // d-0033: a Worker whose liveness hook never registered is not known to be observed.
    if (deps.requireLiveness && !run.hook_registered_at) {
      return failed('no_liveness');
    }

    const ctx = await deps.admitContext(run);
    const { tool_name: native, tool_input: input, tool_use_id: useId } = req.payload;
    const toolId = resolveToolId(ctx, native);
    const call = {
      phase: 'call',
      tool: toolId,
      via: 'direct',
      native,
      input,
    } as const;

    const decision = deps.admit(ctx, call);
    const def = toolDefinition(ctx, toolId);
    const [receipt] = await deps.receipts.append(run.id, (view) => [
      makeDecisionReceipt(
        {
          id: useId ?? newId(),
          run_id: run.id,
          seq: view.lastSeq + 1,
          decision,
          version: def?.version ?? null,
          schema_hash: def?.schema_hash ?? null,
          args_hash: argsHash(input),
          resource: callResource(ctx, call),
          approver: 'auto',
          ts: now(),
        },
        view.last,
        creds.secret,
      ),
    ]);

    return {
      decision: decision.decision,
      reason: decision.reason,
      receipt_hash: receipt?.hash ?? '',
    };
  }

  async function postToolUse(
    run: Run,
    creds: RunCredentials,
    req: Extract<HookRequest, { event: 'PostToolUse' | 'PostToolUseFailure' }>,
  ): Promise<HookResponse> {
    const ctx = await deps.admitContext(run);
    const { tool_use_id: useId } = req.payload;
    const isFailure = req.event === 'PostToolUseFailure';
    const result = isFailure
      ? (req.payload as { error?: unknown }).error
      : (req.payload as { tool_response?: unknown }).tool_response;

    const written = await deps.receipts.append(run.id, (view) => {
      // Only the harness's own id links an effect to a decision; no id, no effect.
      const decision = useId ? view.openDecision(useId) : null;
      // Never admitted, already closed, or refused: nothing to attach an effect to.
      if (!decision || decision.decision !== 'allow') {
        return [];
      }

      return [
        makeEffectReceipt(
          decision,
          {
            state: effectStateFor(toolDefinition(ctx, decision.tool), isFailure),
            result_hash: resultHash(result),
            ts: now(),
          },
          view.last,
          creds.secret,
        ),
      ];
    });

    const receipt = written[0];

    return {
      decision: 'allow',
      reason: receipt
        ? 'effect_recorded'
        : useId
          ? 'effect_unmatched'
          : 'effect_no_tool_use_id',
      receipt_hash: receipt?.hash ?? '',
    };
  }

  async function sessionStart(
    run: Run,
    req: Extract<HookRequest, { event: 'SessionStart' }>,
  ): Promise<HookResponse> {
    await deps.onLiveness?.(run.id, req.payload);

    return {
      decision: 'allow',
      reason: 'liveness_registered',
      receipt_hash: lastHash(await deps.receipts.list(run.id)),
    };
  }

  return {
    async handle(runId, token, request) {
      let run: Run | null = null;
      let creds: RunCredentials | null = null;
      try {
        run = await deps.db.transaction((tx) => tx.runs.get(runId));
        if (!run) {
          return failed('unknown_run');
        }

        creds = await deps.credentials(runId);
        if (!creds) {
          return failed('no_credentials');
        }

        if (!constantTimeEqual(token, creds.token)) {
          await audit(run.id, 'bad_token').catch(() => undefined);

          return failed('bad_token');
        }

        // After the token, so only the run's own Worker learns that the run is over.
        if (!isRunActive(run)) {
          return failed('inactive_run');
        }

        const parsed = HookRequest.safeParse(request);
        if (!parsed.success) {
          return failed('bad_request');
        }

        const req = parsed.data;
        if (req.event === 'SessionStart') {
          return await sessionStart(run, req);
        }

        if (req.event === 'PreToolUse') {
          return await preToolUse(run, creds, req);
        }

        return await postToolUse(run, creds, req);
      } catch {
        if (run && creds) {
          await audit(run.id, 'internal').catch(() => undefined);
        }

        return failed('internal');
      }
    },
  };
}
