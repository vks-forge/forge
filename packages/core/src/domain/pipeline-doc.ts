/**
 * Pipeline edits on a stored override document — pure helpers the pipeline store applies.
 *
 * Why: pipelines live inside the company and project override documents, and every save
 *   writes the whole next document as one version (d-0085). How an edit lands is a rule:
 *   a lane's list replaces the whole lane (lists never merge), a list equal to what the lane
 *   would be without the edit is not stored (so "Reset" and "unchanged" mean the same thing and
 *   a better shipped default still reaches everyone who did not change it), and Reset is
 *   removing the lane's key. Keeping these as pure document-to-document functions means the
 *   store only reads, calls one, validates and appends, and each rule is pinned without a database.
 *
 * Exports: setCompanyLane(), resetCompanyLane(), setProjectLane(), resetProjectLane(),
 *   setProjectRouting(), companyLaneOverridden(), projectLaneOverridden().
 * Depends on: domain/builtin-pipelines, shared/stable-json, schemas/config-override, schemas/pipeline,
 *   schemas/ticket. No IO.
 */

import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import type { CompanyOverride, ProjectOverride } from '#/schemas/config-override.js';
import type { PipelineDefinition, RoutingRule } from '#/schemas/pipeline.js';
import type { Lane } from '#/schemas/ticket.js';
import { stableJson } from '#/shared/stable-json.js';

const same = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

function withCompany(
  doc: CompanyOverride,
  pipelines: CompanyOverride['pipelines'],
): CompanyOverride {
  const rest = { ...doc };
  delete rest.pipelines;

  return pipelines === undefined || Object.keys(pipelines).length === 0
    ? rest
    : { ...rest, pipelines };
}

/** True when the company document replaces `lane`'s shipped pipeline. */
export const companyLaneOverridden = (doc: CompanyOverride, lane: Lane): boolean =>
  doc.pipelines?.[lane] !== undefined;

/** `doc` with company lane `lane` set to `def`; a list equal to the shipped one removes the key. */
export function setCompanyLane(
  doc: CompanyOverride,
  lane: Lane,
  def: PipelineDefinition,
): CompanyOverride {
  const pipelines = { ...doc.pipelines };
  if (same(def, BUILTIN_PIPELINES[lane])) {
    delete pipelines[lane];
  } else {
    pipelines[lane] = def;
  }

  return withCompany(doc, pipelines);
}

/** `doc` without the company's replacement of `lane`: the lane returns to what the release ships. */
export function resetCompanyLane(doc: CompanyOverride, lane: Lane): CompanyOverride {
  const pipelines = { ...doc.pipelines };
  delete pipelines[lane];

  return withCompany(doc, pipelines);
}

function withProject(
  doc: ProjectOverride,
  pipelines: ProjectOverride['pipelines'],
): ProjectOverride {
  const rest = { ...doc };
  delete rest.pipelines;
  const keys = Object.keys(pipelines ?? {});

  return pipelines === undefined || keys.length === 0 ? rest : { ...rest, pipelines };
}

/** True when the project document replaces `lane`'s pipeline. */
export const projectLaneOverridden = (doc: ProjectOverride, lane: Lane): boolean =>
  doc.pipelines?.[lane] !== undefined;

/** `doc` with project lane `lane` set to `def`; a list equal to the company's (`base`) removes the key. */
export function setProjectLane(
  doc: ProjectOverride,
  lane: Lane,
  def: PipelineDefinition,
  base: PipelineDefinition,
): ProjectOverride {
  const pipelines = { ...doc.pipelines };
  if (same(def, base)) {
    delete pipelines[lane];
  } else {
    pipelines[lane] = def;
  }

  return withProject(doc, pipelines);
}

/** `doc` without the project's own `lane`: the lane follows the company again. */
export function resetProjectLane(doc: ProjectOverride, lane: Lane): ProjectOverride {
  const pipelines = { ...doc.pipelines };
  delete pipelines[lane];

  return withProject(doc, pipelines);
}

/** `doc` with the project's routing rules replaced by `rules` (none removes the key). */
export function setProjectRouting(
  doc: ProjectOverride,
  rules: readonly RoutingRule[],
): ProjectOverride {
  const pipelines = { ...doc.pipelines };
  if (rules.length === 0) {
    delete pipelines.routing;
  } else {
    pipelines.routing = [...rules];
  }

  return withProject(doc, pipelines);
}
