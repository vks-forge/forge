/**
 * Shared ConfigSource logic: request checks and effective-config views.
 *
 * Why: the SQLite and in-memory config sources must answer identically (one contract
 *   test runs against both). The rules that are not storage, namely which arguments are
 *   legal for a scope, how an append request is validated, and how stored overrides become
 *   an effective config over the built-in defaults, live here once so the two adapters
 *   only differ in where the rows are kept.
 *
 * Exports: parseAppend(), checkScope(), companyView(), projectView().
 * Depends on: @forge/core, shared/db-errors. No IO.
 */

import {
  BUILTIN_CONFIG,
  ConfigAppend,
  InvalidInputError,
  mergeCompany,
  mergeConfig,
} from '@forge/core';
import type {
  CompanyConfigView,
  CompanyOverride,
  ConfigScope,
  ProjectConfigView,
  ProjectOverride,
} from '@forge/core';
import { mapDbError } from '#/shared/db-errors.js';

/** Validate an append request; a bad document, author, reason or scope/project pairing is `InvalidInputError`. */
export function parseAppend(input: unknown): ConfigAppend {
  try {
    return ConfigAppend.parse(input);
  } catch (error) {
    throw mapDbError(error);
  }
}

/** Throws `InvalidInputError` unless `project` is present exactly when `scope` is `project`. */
export function checkScope(scope: ConfigScope, project: string | undefined): void {
  if (scope === 'company' && project !== undefined) {
    throw new InvalidInputError('company config has no project');
  }

  if (scope === 'project' && (project === undefined || project === '')) {
    throw new InvalidInputError('project config needs a project slug');
  }
}

/** Built-in defaults plus the latest company override (null: none saved, version 0). */
export function companyView(
  doc: CompanyOverride | null,
  version: number,
): CompanyConfigView {
  return { config: mergeCompany(BUILTIN_CONFIG.forge, doc ?? {}), version };
}

/** Built-ins, then the latest company override, then the latest project override. */
export function projectView(
  company: { doc: CompanyOverride | null; version: number },
  project: { doc: ProjectOverride | null; version: number; warnings?: string[] },
): ProjectConfigView {
  return {
    config: mergeConfig(BUILTIN_CONFIG, company.doc ?? {}, project.doc ?? {}),
    version: { company: company.version, project: project.version },
    ...(project.warnings?.length ? { warnings: project.warnings } : {}),
  };
}
