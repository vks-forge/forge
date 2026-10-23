/**
 * Response schemas of the project-settings endpoints.
 *
 * Why: saving settings changes what every later Worker run does, so the screen must refuse
 *   an answer it cannot read rather than render half of it. The shapes mirror apps/server
 *   `routes/settings.ts` and `routes/projects.ts`: `GET /settings/projects/:slug` returns the
 *   merged config plus the company and project versions, `GET .../history` returns every
 *   saved override document, `PUT` returns the version it wrote, and `PATCH /projects/:slug`
 *   returns the archived project row. All pieces are built from `@forge/core` schemas so a
 *   field added there reaches the UI with no edit here.
 *
 * Exports: ProjectConfigResponse, CompanyConfigResponse, ConfigHistoryResponse, SavedVersion,
 *   ArchiveResponse, DeleteResponse, DetectedReply (schemas and inferred types).
 * Depends on: @forge/core (ConfigVersion), schemas/director-config, schemas/projects, zod.
 */

import { ConfigVersion, ProjectCheck, SetupStep } from '@forge/core';
import { z } from 'zod';
import { CompanyConfigReply, EffectiveConfigReply } from '#/schemas/director-config.js';
import { ProjectView } from '#/schemas/projects.js';

export const ProjectConfigResponse = z.object({
  config: EffectiveConfigReply,
  version: z.object({
    company: z.number().int().nonnegative(),
    project: z.number().int().nonnegative(),
  }),
  warnings: z.array(z.string()).optional(),
});
export type ProjectConfigResponse = z.infer<typeof ProjectConfigResponse>;

export const CompanyConfigResponse = CompanyConfigReply;
export type CompanyConfigResponse = z.infer<typeof CompanyConfigResponse>;

export const ConfigHistoryResponse = z.object({ versions: z.array(ConfigVersion) });
export type ConfigHistoryResponse = z.infer<typeof ConfigHistoryResponse>;

export const SavedVersion = ConfigVersion;
export type SavedVersion = z.infer<typeof SavedVersion>;

export const ArchiveResponse = z.object({ project: ProjectView });
export type ArchiveResponse = z.infer<typeof ArchiveResponse>;

/** `DELETE /projects/:slug`: the slug that went; `leftovers` lists Forge folders that stayed locked. */
export const DeleteResponse = z.object({
  deleted: z.string(),
  leftovers: z.array(z.string()).optional(),
});
export type DeleteResponse = z.infer<typeof DeleteResponse>;

/**
 * `GET` / `POST /projects/:slug/detected`: what Forge finds in the folder. `setup` is the default
 * list it runs before each ticket when the settings say nothing; each step's `inputs` start with
 * the file it was found from (the lockfile).
 */
export const DetectedReply = z.object({
  ecosystems: z.array(z.string()),
  checks: z.array(ProjectCheck),
  setup: z.array(SetupStep),
});
export type DetectedReply = z.infer<typeof DetectedReply>;
