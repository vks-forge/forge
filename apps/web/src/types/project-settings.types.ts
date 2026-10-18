/**
 * Shapes for the project-settings screen: what the API port serves, what the page edits.
 *
 * Why: the screen edits only part of a project's override document (checks, ecosystems,
 *   harness, concurrency, fallbacks, Tier C paths, remote, Director) and must carry every other key
 *   (git host, gate rules, tool grants) through a save untouched, or a save from this screen
 *   would silently delete settings made elsewhere. These types name the pieces: the
 *   snapshot a load returns, the editable draft, and the save request.
 *
 * Exports: SettingsSnapshot, SettingsSaveRequest, ProjectSettingsApi, FieldKey, FieldDraft,
 *   FormScope, SettingsDraft, ResearchDraft, DocChange, SettingsIssue, TextFieldSpec.
 * Depends on: @forge/core (types), schemas/project-settings, schemas/projects, types/api.types.
 */

import type {
  ConfigVersion,
  DirectorConfig,
  ForgeConfig,
  ProjectCheck,
} from '@forge/core';
import type { ProjectConfigResponse } from '#/schemas/project-settings.js';
import type { ProjectView } from '#/schemas/projects.js';
import type { RequestOptions } from '#/types/api.types.js';

/** Everything the screen needs about one project's settings, read together so versions agree. */
export interface SettingsSnapshot {
  readonly config: ProjectConfigResponse['config'];
  readonly version: ProjectConfigResponse['version'];
  readonly warnings: readonly string[];
  /** Every saved project version, oldest first. */
  readonly versions: readonly ConfigVersion[];
  /** The latest saved override document: only what this project changed. `{}` before the first save. */
  readonly override: Readonly<Record<string, unknown>>;
  /** Company settings, the source of the inherited concurrency and fallbacks. */
  readonly company: ForgeConfig;
}

/** The tabs of project settings that show overridable fields. */
export type FormScope = 'workers' | 'checks' | 'repository';

export interface SettingsSaveRequest {
  readonly slug: string;
  readonly doc: Record<string, unknown>;
  readonly reason: string;
  readonly expectedVersion: number;
}

export interface ProjectSettingsApi {
  get(slug: string, options?: RequestOptions): Promise<SettingsSnapshot>;
  /** Writes version `expectedVersion + 1`; a 409 `ApiError` (code `version_conflict`) means someone saved first. */
  save(request: SettingsSaveRequest, options?: RequestOptions): Promise<ConfigVersion>;
  /** Archives the project: kept for history, takes no new work. `unarchive` brings it back. */
  archive(slug: string, options?: RequestOptions): Promise<ProjectView>;
  /** Unarchives the project (status `ready`, served again); a 409 `project_not_servable` means its folder is gone and it stays archived. */
  unarchive(slug: string, options?: RequestOptions): Promise<ProjectView>;
  /** Deletes the project from Forge (rows, memory, worktrees); `confirm` must be the slug. Never touches the user's folder. */
  remove(slug: string, confirm: string, options?: RequestOptions): Promise<void>;
}

/** The overridable settings the screen edits. */
export type FieldKey =
  | 'checks'
  | 'ecosystems'
  | 'default_harness'
  | 'max_concurrent'
  | 'harness_fallbacks'
  | 'tier_c_globs'
  | 'remote'
  | 'director'
  | 'research';

/** One field's edit state: whether the project overrides it, and the text or rows being edited. */
export interface FieldDraft<T> {
  readonly overridden: boolean;
  readonly value: T;
}

export interface SettingsDraft {
  readonly checks: FieldDraft<readonly ProjectCheck[]>;
  /** One entry per line. */
  readonly ecosystems: FieldDraft<string>;
  readonly default_harness: FieldDraft<string>;
  readonly max_concurrent: FieldDraft<string>;
  readonly harness_fallbacks: FieldDraft<string>;
  readonly tier_c_globs: FieldDraft<string>;
  readonly remote: FieldDraft<string>;
  /** The project's partial Director settings: a key is present exactly when the project overrides it. */
  readonly director: FieldDraft<Partial<DirectorConfig>>;
  /** The project's research narrowing: on or off, and host lists, one per line. */
  readonly research: FieldDraft<ResearchDraft>;
}

/** What the Research tab edits. `enabled: false` switches research off for the project. */
export interface ResearchDraft {
  readonly enabled: boolean;
  /** One host per line; added to the company's denied hosts. */
  readonly deny_hosts: string;
  /** One host per line; narrows the company's allowed hosts. */
  readonly allow_hosts: string;
}

/** One top-level key that differs between two override documents. */
export interface DocChange {
  readonly key: string;
  readonly kind: 'added' | 'changed' | 'removed';
  readonly before: unknown;
  readonly after: unknown;
}

/** A problem that blocks saving, tied to a field. */
export interface SettingsIssue {
  readonly field: FieldKey;
  readonly message: string;
}

/** How one text-like setting is labelled and edited. */
export interface TextFieldSpec {
  readonly key: Exclude<FieldKey, 'checks' | 'director' | 'research'>;
  readonly label: string;
  readonly hint: string;
  /** Where the inherited value comes from, in words. */
  readonly source: string;
  readonly multiline: boolean;
  readonly placeholder: string;
}
