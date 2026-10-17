/**
 * Shared fixtures for the pipeline tests: the shipped roster and lanes, and small list builders.
 *
 * Why: nearly every pipeline test starts from "the roster Forge ships" and "a lane's shipped
 * list" and then changes one thing. Building both from core's own data keeps the tests honest
 * (they cannot drift from what the product ships) and keeps each test to the one change it pins.
 *
 * Exports: ROSTER, withTag(), lane(), stageIds(), SAVE_REASON.
 * Depends on: @forge/core.
 */

import { BUILTIN_AGENTS, BUILTIN_PIPELINES, effectiveAgents } from '@forge/core';
import type { AgentTag, AgentView, Lane, PipelineDefinition } from '@forge/core';

export const SAVE_REASON = 'for the test';

export const ROSTER: AgentView[] = effectiveAgents(
  structuredClone(BUILTIN_AGENTS),
  undefined,
  () => ({ ready: true, reasons: [] }),
);

/** The roster with `tag` added to agent `id` (switched off, archived). */
export function withTag(id: string, tag: AgentTag): AgentView[] {
  return ROSTER.map((a) => (a.id === id ? { ...a, tags: [...a.tags, tag] } : a));
}

/** A copy of the shipped list of a lane. */
export const lane = (name: Lane): PipelineDefinition =>
  structuredClone(BUILTIN_PIPELINES[name]);

export const stageIds = (def: PipelineDefinition): string[] =>
  def.stages.map((s) => s.id);
