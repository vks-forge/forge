/**
 * The agent shapes the web reads and the reply schemas of the agent routes.
 *
 * Why: an agent is defined once, in `@forge/core`, with its role bounds; the editor must apply
 *   the very same rules before a save so the owner reads "a reviewer cannot use the write tool
 *   edit" in the form instead of as a refusal after pressing Save. This file re-exports those
 *   core shapes under one roof and adds what only the web needs: how each route's answer is
 *   parsed. The server answers a write with the fresh list of the scope it wrote, so the
 *   client never re-derives tags, hashes or readiness; a duplicate answers with the TARGET
 *   scope's list, whose version is a number for the company and a pair for a project.
 *
 * Exports: AgentInput, AgentFields, AgentRole, ArtifactKind, ModelChoice, RunsOn, AgentView,
 *   AgentTag, AgentTemplate, AgentHistoryEntry, AgentTestResult, RunsOnHarness, HarnessModel,
 *   DraftAgentOutput, MAX_AGENT_FALLBACKS (core re-exports), CompanyAgentsReply,
 *   ProjectAgentsReply, CompanyAgentWriteReply, ProjectAgentWriteReply, DuplicateReply,
 *   TemplatesReply, RunsOnReply, HistoryReply, CatalogueReply.
 * Depends on: @forge/core, zod.
 */

import {
  AgentFields as CoreAgentFields,
  AgentHistoryEntry,
  AgentInput,
  AgentRole,
  AgentTag,
  AgentTemplate,
  AgentTestResult,
  AgentView,
  ArtifactKind,
  DraftAgentOutput,
  HarnessModel,
  MAX_AGENT_FALLBACKS,
  ModelChoice,
  RunsOn,
  RunsOnHarness,
} from '@forge/core';
import { z } from 'zod';

export {
  AgentHistoryEntry,
  AgentInput,
  AgentRole,
  AgentTag,
  AgentTemplate,
  AgentTestResult,
  AgentView,
  ArtifactKind,
  DraftAgentOutput,
  HarnessModel,
  MAX_AGENT_FALLBACKS,
  ModelChoice,
  RunsOn,
  RunsOnHarness,
};

/** The editable fields of an agent, as the routes take them (core has no type export for it). */
export const AgentFields = CoreAgentFields;
export type AgentFields = z.infer<typeof CoreAgentFields>;

const Views = z.array(AgentView);
const ProjectVersion = z.object({
  company: z.number().int().nonnegative(),
  project: z.number().int().nonnegative(),
});

/** `GET /settings/agents`. */
export const CompanyAgentsReply = z.object({
  agents: Views,
  version: z.number().int().nonnegative(),
});

/** `GET /settings/projects/:slug/agents`. */
export const ProjectAgentsReply = z.object({ agents: Views, version: ProjectVersion });

/** A company create: the fresh list and the new id. */
export const CompanyAgentWriteReply = CompanyAgentsReply.extend({ id: z.string() });

/** A project create: the fresh list and the new id. */
export const ProjectAgentWriteReply = ProjectAgentsReply.extend({ id: z.string() });

/** A duplicate answers for its target scope: a number (company) or a pair (project). */
export const DuplicateReply = z.object({
  id: z.string(),
  agents: Views,
  version: z.union([z.number().int().nonnegative(), ProjectVersion]),
});

export const TemplatesReply = z.object({ templates: z.array(AgentTemplate) });
export const RunsOnReply = z.object({ harnesses: z.array(RunsOnHarness) });
export const HistoryReply = z.object({ versions: z.array(AgentHistoryEntry) });

/**
 * `GET /settings/catalogue`, read leniently: the editor needs only each tool's id and risk
 * class to offer a checklist; the server re-checks every id on save (`unknown_tool`).
 */
export const CatalogueReply = z.object({
  doc: z.object({
    entries: z.array(z.object({ id: z.string().min(1), risk: z.string() })),
  }),
});
