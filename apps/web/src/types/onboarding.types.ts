/**
 * Shapes of the first-run and new-project screens: the API port, the form draft and its errors.
 *
 * Why: the wizard and the `/projects/new` page share one form, one server contract and one
 *   set of plain-language errors; naming them once keeps both hosts and the tests honest
 *   about what a draft holds and which field an error belongs to.
 *
 * Exports: OnboardingApi, ProjectCreateRequest, ProjectHostChoice, ProjectDraft, ProjectField, ExplainProblem,
 *   FieldProblem, WizardStepId.
 * Depends on: @forge/core (types), schemas/projects, types/api.types. Types only.
 */

import type { ProjectCheck, ProjectInspection, SystemInfo } from '@forge/core';
import type { ProjectCreated } from '#/schemas/projects.js';
import type { RequestOptions } from '#/types/api.types.js';

/** The body of `POST /projects` as the form sends it (the server body is strict). */
export interface ProjectCreateRequest {
  readonly slug: string;
  readonly prefix: string;
  readonly local_path: string;
  readonly base_branch: string;
  readonly git_host?: {
    readonly kind: 'local';
    readonly remote_path: string;
    readonly base_branch: string;
  };
  readonly connection_id?: string;
  readonly repo_full_name?: string;
  readonly installation_id?: string;
  readonly settings: { readonly checks: readonly ProjectCheck[] };
  readonly author: string;
  readonly reason: string;
}

export interface OnboardingApi {
  /** Version, data folder and whether setup is finished. */
  system(options?: RequestOptions): Promise<SystemInfo>;
  /** Dry run of registering a folder; creates nothing. */
  inspect(
    body: { readonly local_path: string; readonly base_branch?: string },
    options?: RequestOptions,
  ): Promise<ProjectInspection>;
  createProject(body: ProjectCreateRequest): Promise<ProjectCreated>;
}

/** How tickets reach a remote: a local bare repository, or a GitHub connection. */
export type ProjectHostChoice = 'local' | 'github';

/** What the person has typed or accepted in the project form. */
export interface ProjectDraft {
  readonly slug: string;
  readonly prefix: string;
  readonly baseBranch: string;
  readonly host: ProjectHostChoice;
  readonly remotePath: string;
  readonly connectionId: string;
  readonly repo: string;
  readonly installationId: string;
  readonly checks: readonly ProjectCheck[];
}

/** The form fields an error can be pinned to; `form` is for problems no field owns. */
export type ProjectField =
  | 'local_path'
  | 'slug'
  | 'prefix'
  | 'base_branch'
  | 'remote_path'
  | 'connection'
  | 'repo'
  | 'installation_id'
  | 'checks'
  | 'form';

/** A problem in plain words with what to do about it (Nielsen 9). */
export interface FieldProblem {
  readonly field: ProjectField;
  readonly message: string;
  readonly fix: string;
}

/** Wording for one server refusal code, given the chosen host and the server's own message. */
export type ExplainProblem = (context: {
  host: ProjectHostChoice;
  message: string;
}) => FieldProblem;

export type WizardStepId = 'data' | 'harness' | 'github' | 'project';
