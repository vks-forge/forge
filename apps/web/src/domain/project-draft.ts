/**
 * The new-project form's draft: prefill from an inspection, check before sending, build the body.
 *
 * Why: the server is the authority and re-checks every body, but a typo caught beside its box
 *   costs nothing while one found after a round trip costs a click and a wait. These rules
 *   mirror the server's body (slug and prefix patterns, the git choices the folder needs) so
 *   the form can point at the field, and a name or prefix another project already uses is
 *   caught while typing. Prefilling from the folder check means the common case is accepting
 *   what Forge found. Folder, git and scope choices are derived from what git said about the
 *   folder, never typed. Pure functions, no IO.
 *
 * Exports: draftFromInspection(), validateDraft(), buildCreateRequest(), repoFullName(), EMPTY_DRAFT,
 *   SLUG_PATTERN.
 * Depends on: @forge/core (PROJECT_PREFIX_PATTERN), types/onboarding.types.
 */

import { PROJECT_PREFIX_PATTERN } from '@forge/core';
import type { ProjectInspection } from '@forge/core';
import type {
  ProjectCreateRequest,
  ProjectDraft,
  ProjectField,
  TakenNames,
} from '#/types/onboarding.types.js';

export const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

export const EMPTY_DRAFT: ProjectDraft = {
  slug: '',
  prefix: '',
  baseBranch: '',
  host: 'local',
  gitSetup: 'snapshot',
  scope: 'root',
  connectionId: '',
  repo: '',
  installationId: '',
  checks: [],
};

/** `owner/name` of the remote's GitHub repository, or '' when the folder has none. */
export function repoFullName(inspection: ProjectInspection | null): string {
  const github = inspection?.git.remote?.github;

  return github ? `${github.owner}/${github.repo}` : '';
}

/** The draft Forge suggests for a folder it just inspected; the GitHub choice keeps what the user had. */
export function draftFromInspection(
  inspection: ProjectInspection,
  previous: ProjectDraft = EMPTY_DRAFT,
): ProjectDraft {
  const github = inspection.git.remote?.github ?? null;

  return {
    ...previous,
    slug: inspection.suggested_slug,
    prefix: inspection.suggested_prefix,
    baseBranch: inspection.base_branch,
    checks: inspection.checks,
    gitSetup: 'snapshot',
    scope: 'root',
    // GitHub only makes sense when the folder's remote is a GitHub repository.
    host: github ? previous.host : 'local',
    repo: github ? `${github.owner}/${github.repo}` : '',
  };
}

/** One message per field that would be refused; empty when the draft can be sent. */
export function validateDraft(
  draft: ProjectDraft,
  author: string,
  taken?: TakenNames,
): Partial<Record<ProjectField, string>> {
  const problems: Partial<Record<ProjectField, string>> = {};

  if (!SLUG_PATTERN.test(draft.slug)) {
    problems.slug =
      'Use lower-case letters, digits and dashes, starting with a letter (for example my-app).';
  }

  if (!PROJECT_PREFIX_PATTERN.test(draft.prefix)) {
    problems.prefix = 'Use 1 to 10 capital letters or digits, starting with a letter.';
  }

  if (problems.slug === undefined && taken?.slugs.has(draft.slug)) {
    problems.slug = 'A project with that name already exists. Add a number or a word.';
  }

  if (problems.prefix === undefined && taken?.prefixes.has(draft.prefix)) {
    problems.prefix =
      'Another project already uses that ticket prefix; ticket ids would clash.';
  }

  if (draft.baseBranch.trim() === '') {
    problems.base_branch = 'Choose the branch tickets are cut from and merged into.';
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

/** The strict `POST /projects` body for a validated draft and the inspection of its folder. */
export function buildCreateRequest(
  folder: string,
  draft: ProjectDraft,
  author: string,
  inspection: ProjectInspection,
): ProjectCreateRequest {
  const { git } = inspection;
  const root =
    git.state === 'inside_repo' && draft.scope === 'root' ? git.repo_root : null;

  const base = {
    slug: draft.slug,
    prefix: draft.prefix,
    // Choosing the repository's top folder registers that folder, never a nested path.
    local_path: (root ?? folder).trim(),
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
    ...(git.state === 'none' ? { git_setup: { mode: draft.gitSetup } } : {}),
    ...(git.state === 'inside_repo' ? { scope: { mode: draft.scope } } : {}),
  };

  if (draft.host === 'github') {
    return {
      ...base,
      connection_id: draft.connectionId,
      repo_full_name: draft.repo.trim(),
      installation_id: draft.installationId.trim(),
    };
  }

  // No GitHub: verified work merges locally into the base branch (d-0124), so no host is named.
  return base;
}
