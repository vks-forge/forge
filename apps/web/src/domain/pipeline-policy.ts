/**
 * Pipeline check policy: what a check stage does with blocking findings, stored as differences.
 *
 * Why: a check stage's policy (send the work back or hold it for the owner, which severities
 *   block, which earlier writer gets the work) has defaults, and a list that spelled the defaults
 *   out would look edited when nobody changed it and would never pick up a better shipped
 *   default. So the editor reads a policy with its defaults filled in and writes back only what
 *   differs. The places a check can send work back to are the writers above it, and only those.
 *
 * Exports: policyOf(), withPolicy(), writersAbove(), DEFAULT_BLOCKING.
 * Depends on: domain/pipeline-edit, @forge/core (types), types/pipeline-ui.types. No IO.
 */

import type { AgentView, PipelineDefinition } from '@forge/core';
import { isWriterRole } from '@forge/core';
import { roleOf } from '#/domain/pipeline-edit.js';
import type {
  CheckPolicyView,
  CheckStage,
  Member,
  WriterOption,
} from '#/types/pipeline-ui.types.js';

export const DEFAULT_BLOCKING = ['critical', 'high'] as const;

/** The stage's check policy with defaults filled in. */
export function policyOf(stage: CheckStage | Member): CheckPolicyView {
  return {
    on_blocking: stage.on_blocking ?? 'rework',
    blocking: stage.blocking ?? DEFAULT_BLOCKING,
    rework_to: stage.rework_to ?? '',
  };
}

/** `stage` with `policy` stored as differences from the defaults only. */
export function withPolicy<S extends CheckStage | Member>(
  stage: S,
  policy: CheckPolicyView,
): S {
  const next: Record<string, unknown> = { ...stage };
  const sameBlocking =
    policy.blocking.length === DEFAULT_BLOCKING.length &&
    DEFAULT_BLOCKING.every((s) => policy.blocking.includes(s));

  delete next['on_blocking'];
  delete next['blocking'];
  delete next['rework_to'];

  if (policy.on_blocking === 'hold') {
    next['on_blocking'] = 'hold';
  }

  if (!sameBlocking) {
    next['blocking'] = [...policy.blocking];
  }

  if (policy.rework_to !== '') {
    next['rework_to'] = policy.rework_to;
  }

  return next as S;
}

/** Writers and testers above stage `id`: the places a check can send work back to. */
export function writersAbove(
  def: PipelineDefinition,
  id: string,
  roster: readonly AgentView[],
): WriterOption[] {
  const at = def.stages.findIndex((s) => s.id === id);

  return def.stages
    .slice(0, Math.max(at, 0))
    .filter((s) => isWriterRole(roleOf(s, roster)))
    .map((s) => ({ id: s.id, label: s.label }));
}
