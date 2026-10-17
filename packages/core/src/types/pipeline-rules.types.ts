/**
 * Inputs of the pipeline rule checks.
 *
 * Why: the rules that make a pipeline safe (who may approve whose work, where G1 sits) depend
 *   on facts outside the pipeline itself: which agents exist, what role each has, and whether
 *   the owner switched one off. The checks stay pure by taking those facts as a plain lookup
 *   instead of reading a roster source, so the settings screen, the save door and a ticket's
 *   snapshot all judge a list the same way.
 *
 * Exports: PipelineRuleContext, RosterEntry, AgentStageOf.
 * Depends on: schemas/agent, schemas/agent-api, schemas/ticket. Types only.
 */

import type { AgentView } from '#/schemas/agent-api.js';
import type { Stage } from '#/schemas/pipeline.js';
import type { Lane } from '#/schemas/ticket.js';

/** The part of an agent view the rules read. */
export type RosterEntry = Pick<AgentView, 'id' | 'tags' | 'definition'>;

/** What `pipelineProblems` is told about the world the pipeline will run in. */
export interface PipelineRuleContext {
  readonly roster: readonly RosterEntry[];
  readonly lane: Lane;
}

/** An agent stage, top level or a group member. */
export type AgentStageOf = Extract<Stage, { kind: 'agent' }>;
