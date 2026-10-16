/**
 * Shapes of the first-run and new-project screens: the API port, the form draft and its errors.
 *
 * Why: the first-run wizard and the new-project modal share one set of steps, one server
 *   contract and one set of plain-language errors; naming them once keeps both hosts and the
 *   tests honest about what a draft holds, which step a field belongs to and which field an
 *   error belongs to.
 *
 * Exports: OnboardingApi, ProjectCreateRequest, ProjectHostChoice, ProjectDraft, ProjectField, ExplainProblem,
 *   FieldProblem, WizardStepId, ProjectStepId, FolderSort, GitSetupMode, ScopeMode, ProjectWizard,
 *   ProjectProblems, TakenNames.
 * Depends on: @forge/core (types), schemas/projects, types/api.types. Types only.
 */

import type {
  FolderEntry,
  FolderListing,
  FolderPick,
  FolderReveal,
  ProjectCheck,
  ProjectInspection,
  SystemInfo,
} from '@forge/core';
import type { ProjectCreated } from '#/schemas/projects.js';
import type { RequestOptions } from '#/types/api.types.js';

/** The body of `POST /projects` as the form sends it (the server body is strict). */
export interface ProjectCreateRequest {
  readonly slug: string;
  readonly prefix: string;
  readonly local_path: string;
  readonly base_branch: string;
  /** Required when the folder has no repository (state `none`). */
  readonly git_setup?: { readonly mode: GitSetupMode };
  /** Required when the folder sits inside a repository (state `inside_repo`). */
  readonly scope?: { readonly mode: ScopeMode };
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
  /** Sub-folders of an absolute folder; no path lists the places to start from. */
  listFolders(path?: string, options?: RequestOptions): Promise<FolderListing>;
  /** Opens the system folder window on this computer and waits for the person's choice; `start` is the folder to open in. */
  pickFolder(start?: string, options?: RequestOptions): Promise<FolderPick>;
  /** Makes one folder named `name` inside the absolute folder `parent`. */
  createFolder(
    body: { readonly parent: string; readonly name: string },
    options?: RequestOptions,
  ): Promise<FolderEntry>;
  /** Shows a folder in Explorer, Finder or the Linux file manager. */
  revealFolder(path: string, options?: RequestOptions): Promise<FolderReveal>;
  createProject(body: ProjectCreateRequest): Promise<ProjectCreated>;
}

/** One message per form field that has a problem. */
export type ProjectProblems = Partial<Record<ProjectField, string>>;

/** Slugs and prefixes the registered projects already use (lower-case slugs, upper-case prefixes). */
export interface TakenNames {
  readonly slugs: ReadonlySet<string>;
  readonly prefixes: ReadonlySet<string>;
}

/** How Forge starts a repository in a folder that has none: commit what is there, or only `git init`. */
export type GitSetupMode = 'snapshot' | 'init_only';

/** For a folder inside a repository: use the repository's top folder, or only this subfolder. */
export type ScopeMode = 'root' | 'subfolder';

/** How the folder browser orders folders. */
export type FolderSort = 'name_asc' | 'name_desc' | 'date_desc' | 'date_asc';

/** How verified work lands: merged locally into the base branch, or through a GitHub connection. */
export type ProjectHostChoice = 'local' | 'github';

/** What the person has typed or accepted in the project form. */
export interface ProjectDraft {
  readonly slug: string;
  readonly prefix: string;
  readonly baseBranch: string;
  readonly host: ProjectHostChoice;
  readonly gitSetup: GitSetupMode;
  readonly scope: ScopeMode;
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

/** The steps inside "add a project", in order. */
export type ProjectStepId = 'folder' | 'git' | 'details' | 'checks' | 'review';

/** Everything the project steps read and write, and what they can do; held by `useProjectWizard`. */
export interface ProjectWizard {
  readonly folder: string;
  /** What Forge found in `folder`; null until checked and again when the folder changes. */
  readonly inspection: ProjectInspection | null;
  readonly inspecting: boolean;
  readonly folderProblem: FieldProblem | null;
  readonly draft: ProjectDraft;
  readonly step: ProjectStepId;
  /** Problems to show now: fields the person touched, plus what the server refused. */
  readonly shown: Partial<Record<ProjectField, string>>;
  /** True when the current step has no problems; Next is disabled while false. */
  readonly canAdvance: boolean;
  readonly formProblem: FieldProblem | null;
  readonly creating: boolean;
  readonly author: string;
  readonly online: boolean;
  /** A folder is chosen and nothing is created yet: leaving should ask first. */
  readonly dirty: boolean;
  /** Choose a folder (from Browse) and check it. */
  choose(path: string): Promise<void>;
  patch(change: Partial<ProjectDraft>): void;
  setAuthor(name: string): void;
  /** Next on every step but the last; Create on the last. */
  submit(): Promise<void>;
  back(): void;
  goTo(step: ProjectStepId): void;
}
