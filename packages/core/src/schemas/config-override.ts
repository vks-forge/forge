/**
 * Config override schemas — what the database stores for company and project settings.
 *
 * Why: settings are edited in the UI and stored as immutable numbered versions (d-0085,
 *   d-0090). Each version holds only what the user changed, never a full copy, so a later
 *   change to a built-in default still reaches everyone who did not override it. These
 *   schemas define the stored document for each scope, the version record, and the append
 *   request; all are strict, so a typo or a project trying to set its own slug is refused
 *   when written, not discovered when a tick reads it.
 *
 * Exports: CompanyOverride, ProjectSettings, ProjectOverride, EffectiveConfig, ConfigVersionRef,
 *   ConfigScope, ConfigVersion, ConfigAppend (and their types).
 * Depends on: domain/legacy-company-doc, domain/legacy-project-doc, schemas/forge-config, schemas/project, shared/deep-partial, types/config.types,
 *   zod. No IO.
 */

import { z } from 'zod';
import { ForgeConfig } from '#/schemas/forge-config.js';
import { migrateLegacyCompanyDoc } from '#/domain/legacy-company-doc.js';
import {
  legacyProjectDocProblem,
  migrateLegacyProjectDoc,
} from '#/domain/legacy-project-doc.js';
import { ProjectConfigShape } from '#/schemas/project.js';
import { deepPartial } from '#/shared/deep-partial.js';
import type { DeepPartial } from '#/types/config.types.js';

/** Settings that can differ per project: `ProjectConfigShape` without its identity (slug, prefix). */
export const ProjectSettings = ProjectConfigShape.omit({ slug: true, prefix: true });
export type ProjectSettings = z.infer<typeof ProjectSettings>;

/** Fully merged settings for one project: the company-wide dials plus the project's own. */
export const EffectiveConfig = z.object({ forge: ForgeConfig, project: ProjectSettings });
export type EffectiveConfig = z.infer<typeof EffectiveConfig>;

/** Company override: any subset of `ForgeConfig`, strict. A stored document that says `engine.global_slots` is read as `max_concurrent_global`. */
export const CompanyOverride = z.preprocess(
  migrateLegacyCompanyDoc,
  deepPartial(ForgeConfig),
) as unknown as z.ZodType<DeepPartial<ForgeConfig>>;
export type CompanyOverride = z.infer<typeof CompanyOverride>;

/**
 * Project override: any subset of `ProjectSettings`, strict. Identity is not overridable.
 * A stored or submitted document in the old `profile` + `commands` form is converted to
 * `checks` first (see `migrateLegacyProjectDoc`), so history is never rewritten.
 */
export const ProjectOverride = z.preprocess((value, ctx) => {
  const problem = legacyProjectDocProblem(value);
  if (problem !== null) {
    ctx.issues.push({ code: 'custom', message: problem, input: value });
  }

  return migrateLegacyProjectDoc(value);
}, deepPartial(ProjectSettings)) as unknown as z.ZodType<DeepPartial<ProjectSettings>>;
export type ProjectOverride = z.infer<typeof ProjectOverride>;

/** `c<company version>:p<project version>`, e.g. `c3:p1`; names the exact settings a run used. */
export const ConfigVersionRef = z.string().regex(/^c\d+:p\d+$/);
export type ConfigVersionRef = z.infer<typeof ConfigVersionRef>;

export const ConfigScope = z.enum(['company', 'project']);
export type ConfigScope = z.infer<typeof ConfigScope>;

const Slug = z.string().regex(/^[a-z][a-z0-9-]*$/);
const Who = z.string().min(1);

/** One stored, immutable version of a scope's override document. */
export const ConfigVersion = z.discriminatedUnion('scope', [
  z.object({
    id: z.number().int().positive(),
    scope: z.literal('company'),
    project: z.null(),
    version: z.number().int().positive(),
    doc: CompanyOverride,
    author: Who,
    reason: Who,
    created_at: z.number().int().nonnegative(),
  }),
  z.object({
    id: z.number().int().positive(),
    scope: z.literal('project'),
    project: Slug,
    version: z.number().int().positive(),
    doc: ProjectOverride,
    author: Who,
    reason: Who,
    created_at: z.number().int().nonnegative(),
  }),
]);
export type ConfigVersion = z.infer<typeof ConfigVersion>;

/**
 * Request to write version `expectedVersion + 1` of a scope. `expectedVersion` is the
 * version the editor was looking at (0 when the scope has no row yet); a mismatch means
 * someone else saved first.
 */
export const ConfigAppend = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('company'),
    project: z.undefined().optional(),
    doc: CompanyOverride,
    author: Who,
    reason: Who,
    expectedVersion: z.number().int().nonnegative(),
  }),
  z.object({
    scope: z.literal('project'),
    project: Slug,
    doc: ProjectOverride,
    author: Who,
    reason: Who,
    expectedVersion: z.number().int().nonnegative(),
  }),
]);
export type ConfigAppend = z.infer<typeof ConfigAppend>;
