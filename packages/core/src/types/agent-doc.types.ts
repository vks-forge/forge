/**
 * Types for the agents section of the stored override documents.
 *
 * Why: the agent edit helpers work on the `agents` part of the company and project documents,
 *   which is a deep partial of the full config (a built-in is stored as a diff, a custom agent
 *   whole). Naming those two shapes once keeps the helpers readable and lets the compiler check
 *   that every edit still fits the document it came from.
 *
 * Exports: CompanyAgentsDoc, ProjectAgentsDoc.
 * Depends on: schemas/config-override. Types only.
 */

import type { CompanyOverride, ProjectOverride } from '#/schemas/config-override.js';

/** The `agents` section of a company document. */
export type CompanyAgentsDoc = NonNullable<CompanyOverride['agents']>;

/** The `agents` section of a project document. */
export type ProjectAgentsDoc = NonNullable<ProjectOverride['agents']>;
