/**
 * ConfigSource port — the effective settings, as versioned in the database.
 *
 * Why: the engine and the server must read settings the same way whether they live in
 *   SQLite or a test double, and must be able to say which version a run used (d-0085).
 *   Behind a port the engine never learns where config is stored, and a settings change
 *   is one append that the next tick sees, with the old versions kept for audit and
 *   replay. Writes are compare-and-swap so two editors cannot silently overwrite each other.
 *
 * Exports: ConfigSource, CompanyConfigView, ProjectConfigView.
 * Depends on: schemas/config-override, schemas/forge-config. Types only.
 */

import type {
  ConfigAppend,
  ConfigScope,
  ConfigVersion,
  EffectiveConfig,
} from '#/schemas/config-override.js';
import type { ForgeConfig } from '#/schemas/forge-config.js';

/** Company-wide settings: built-in defaults plus the latest company override. */
export interface CompanyConfigView {
  readonly config: ForgeConfig;
  /** Latest company version; 0 when nothing was ever saved (built-in defaults). */
  readonly version: number;
}

/** One project's settings: defaults, then company override, then project override. */
export interface ProjectConfigView {
  readonly config: EffectiveConfig;
  readonly version: { readonly company: number; readonly project: number };
}

export interface ConfigSource {
  /** Effective company config. Never writes: with no saved row it returns the built-ins at version 0. */
  company(): Promise<CompanyConfigView>;
  /** Effective config for `slug`; a project with no saved row gets project version 0. */
  project(slug: string): Promise<ProjectConfigView>;
  /** Every saved version of the scope, oldest first. `project` is required for scope `project`, forbidden for `company`. */
  history(scope: ConfigScope, project?: string): Promise<readonly ConfigVersion[]>;
  /**
   * Save version `expectedVersion + 1` of a scope and return it. Throws
   * `ConfigVersionConflictError` when the scope's current version is not `expectedVersion`,
   * and `InvalidInputError` when the document, author or reason is invalid.
   */
  append(input: ConfigAppend): Promise<ConfigVersion>;
}
