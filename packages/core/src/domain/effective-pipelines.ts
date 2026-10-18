/**
 * Effective pipelines — the pipeline each lane runs, and where it came from.
 *
 * Why: the company keeps one pipeline per lane (the shipped one unless edited) and a project
 *   may replace any lane with its own (d-0151). Screens and the engine must agree on what that
 *   adds up to and on how to describe it: built-in or edited, inherited or the project's own,
 *   and whether the lane can run today. The hash names the exact list so a ticket can record
 *   what it started on. The warnings carry the one soft rule (d-0073): a critic that runs on
 *   the same model family as the Worker approves its work too easily, which is allowed while
 *   only one family is connected, but the owner should be told.
 *
 * Exports: effectivePipelines(), modelFamilyOf(), isCritic(), sameFamilyCritics(), LANES.
 * Depends on: domain/builtin-pipelines, domain/builtin-agent-texts/critic, domain/stage-kinds,
 *   schemas/pipeline, schemas/ticket, types/pipeline-rules. No IO.
 */

import { SAME_FAMILY_WARNING } from '#/domain/builtin-agent-texts/critic.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { classifyStage, flattenStages, pipelineHash } from '#/domain/stage-kinds.js';
import type { ModelChoice } from '#/schemas/agent.js';
import type {
  AgentStage,
  LanePipelines,
  PipelineDefinition,
  PipelineTag,
  PipelineView,
  ProjectPipelines,
} from '#/schemas/pipeline.js';
import type { Lane } from '#/schemas/ticket.js';
import type { RosterEntry } from '#/types/pipeline-rules.types.js';

/** The three lanes in escalation order. */
export const LANES: readonly Lane[] = ['express', 'standard', 'full'];

/** The vendor family a model id belongs to; `forge_default` and the harness default are Claude's today. */
export function modelFamilyOf(choice: ModelChoice): string {
  if (choice.kind !== 'model') {
    return 'claude';
  }

  const id = choice.id.toLowerCase();
  if (/^(opus|sonnet|haiku|claude)/.test(id)) {
    return 'claude';
  }

  if (/^(gpt|o\d|codex|chatgpt)/.test(id)) {
    return 'openai';
  }

  return /^gemini/.test(id) ? 'google' : id;
}

/**
 * True for a critic: a reviewer-role agent whose id or name says critic, or one made from the
 * critic (a duplicate or a template of it). These are the agents d-0073 asks to run on another family.
 */
export const isCritic = (e: RosterEntry): boolean =>
  e.definition.role === 'reviewer' &&
  (/critic/i.test(e.id) ||
    /critic/i.test(e.definition.name) ||
    e.definition.origin === 'duplicate:critic' ||
    /^template:.*critic/.test(e.definition.origin));

/** The critic agent stages of `def` (members of groups included) whose model family is also a writer's. */
export function sameFamilyCritics(
  def: PipelineDefinition,
  roster: readonly RosterEntry[],
): AgentStage[] {
  const byId = new Map(roster.map((e) => [e.id, e]));
  const roles = Object.fromEntries(roster.map((e) => [e.id, e.definition.role]));
  const writerAgents = def.stages.flatMap((s) => {
    const klass = classifyStage(s, roles);
    if (klass === 'writer' && s.kind === 'agent') {
      return [s.agent];
    }

    return klass === 'writer_group' && s.kind === 'group'
      ? s.members.flatMap((m) => (m.kind === 'agent' ? [m.agent] : []))
      : [];
  });

  const families = new Set(
    writerAgents.map((w) =>
      modelFamilyOf(byId.get(w)?.definition.runs_on.model ?? { kind: 'forge_default' }),
    ),
  );

  return flattenStages(def).flatMap((s) => {
    const entry = s.kind === 'agent' ? byId.get(s.agent) : undefined;

    return s.kind === 'agent' &&
      entry &&
      isCritic(entry) &&
      families.has(modelFamilyOf(entry.definition.runs_on.model))
      ? [s]
      : [];
  });
}

const warningsFor = (def: PipelineDefinition, roster: readonly RosterEntry[]): string[] =>
  sameFamilyCritics(def, roster).map((s) => `${s.label}: ${SAME_FAMILY_WARNING}`);

/**
 * The view of every lane. `company` is the merged company pipelines (shipped lists with the
 * owner's replacements); `project` may replace lanes; `live` names the lanes that can run.
 */
export function effectivePipelines(
  company: LanePipelines,
  project: ProjectPipelines | undefined,
  roster: readonly RosterEntry[],
  live: readonly Lane[] = LANES,
): Record<Lane, PipelineView> {
  const out = {} as Record<Lane, PipelineView>;
  for (const lane of LANES) {
    const own = project?.[lane];
    const definition = own ?? company[lane];
    const hash = pipelineHash(definition);
    const shipped = pipelineHash(BUILTIN_PIPELINES[lane]) === hash;
    const tags: PipelineTag[] = [shipped ? 'builtin' : 'edited'];
    if (project !== undefined) {
      tags.push(own ? 'project' : 'company');
    }

    out[lane] = {
      lane,
      definition,
      hash,
      tags,
      live: live.includes(lane),
      warnings: warningsFor(definition, roster),
    };
  }

  return out;
}
