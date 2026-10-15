/**
 * The new-project form's draft: prefill from an inspection, check before sending, build the body.
 *
 * Why: the server is the authority and re-checks every body, but a typo caught beside its box
 *   costs nothing while one found after a round trip costs a click and a wait. These rules
 *   mirror the server's body (slug and prefix patterns, one way to name the git host) so the
 *   form can point at the field. Prefilling from the folder check means the common case is
 *   accepting what Forge found. Pure functions, no IO.
 *
 * Exports: draftFromInspection(), validateDraft(), buildCreateRequest(), EMPTY_DRAFT, SLUG_PATTERN.
 * Depends on: @forge/core (PROJECT_PREFIX_PATTERN), types/onboarding.types.
 */

import { PROJECT_PREFIX_PATTERN } from '@forge/core';
import type { ProjectInspection } from '@forge/core';
import type {
  ProjectCreateRequest,
  ProjectDraft,
  ProjectField,
} from '#/types/onboarding.types.js';

export const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

export const EMPTY_DRAFT: ProjectDraft = {
  slug: '',
  prefix: '',
  baseBranch: '',
  host: 'local',
  remotePath: '',
  connectionId: '',
  repo: '',
  installationId: '',
  checks: [],
};

/** The draft Forge suggests for a folder it just inspected; host choices keep what the user had. */
export function draftFromInspection(
  inspection: ProjectInspection,
  previous: ProjectDraft = EMPTY_DRAFT,
): ProjectDraft {
  return {
    ...previous,
    slug: inspection.suggested_slug,
    prefix: inspection.suggested_prefix,
    baseBranch: inspection.base_branch,
    checks: inspection.checks,
  };
}

/** One message per field that would be refused; empty when the draft can be sent. */
export function validateDraft(
  draft: ProjectDraft,
  author: string,
): Partial<Record<ProjectField, string>> {
  const problems: Partial<Record<ProjectField, string>> = {};

  if (!SLUG_PATTERN.test(draft.slug)) {
    problems.slug =
      'Use lower-case letters, digits and dashes, starting with a letter (for example my-app).';
  }

  if (!PROJECT_PREFIX_PATTERN.test(draft.prefix)) {
    problems.prefix = 'Use 1 to 10 capital letters or digits, starting with a letter.';
  }

  if (draft.baseBranch.trim() === '') {
    problems.base_branch = 'Choose the branch tickets are cut from and merged into.';
  }

  if (draft.host === 'local' && draft.remotePath.trim() === '') {
    problems.remote_path =
      'Enter the bare repository Forge merges into (a path relative to your clone also works).';
  }

  if (draft.host === 'github') {
    if (draft.connectionId === '') {
      problems.connection = 'Choose a GitHub connection, or use local git only.';
    }

    if (!/^[^/\s]+\/[^/\s]+$/.test(draft.repo)) {
      problems.repo = 'Write the repository as owner/name.';
    }

    if (!/^[0-9]+$/.test(draft.installationId)) {
      problems.installation_id =
        'The installation id is the number at the end of the installation URL.';
    }
  }

  const names = draft.checks.map((c) => c.name.trim());
  if (draft.checks.some((c) => c.command.trim() === '' || c.name.trim() === '')) {
    problems.checks = 'Every check needs a name and a command.';
  } else if (new Set(names).size !== names.length) {
    problems.checks = 'Check names must be different from each other.';
  }

  if (author.trim() === '') {
    problems.form = 'Say who is creating the project; the name is kept in its history.';
  }

  return problems;
}

/** The strict `POST /projects` body for a validated draft. */
export function buildCreateRequest(
  folder: string,
  draft: ProjectDraft,
  author: string,
): ProjectCreateRequest {
  const base = {
    slug: draft.slug,
    prefix: draft.prefix,
    local_path: folder.trim(),
    base_branch: draft.baseBranch.trim(),
    settings: {
      checks: draft.checks.map((c) => ({
        name: c.name.trim(),
        role: c.role,
        command: c.command.trim(),
        // The editor leaves an empty string for "the repository root"; the server wants it absent.
        ...(c.cwd && c.cwd.trim() !== '' ? { cwd: c.cwd.trim() } : {}),
      })),
    },
    author: author.trim(),
    reason: 'project created in the web app',
  };

  if (draft.host === 'github') {
    return {
      ...base,
      connection_id: draft.connectionId,
      repo_full_name: draft.repo.trim(),
      installation_id: draft.installationId.trim(),
    };
  }

  return {
    ...base,
    git_host: {
      kind: 'local',
      remote_path: draft.remotePath.trim(),
      base_branch: draft.baseBranch.trim(),
    },
  };
}
