/**
 * `explainCreateError()`: turns a refused project check into a field, a sentence and a fix.
 *
 * Why: the server refuses a bad project with a code (`not_repository_root`, `prefix_in_use`)
 *   and a short message. A person filling in the form needs to know which box is wrong and
 *   what to do next ("choose the folder that contains .git"), not a code. The wording is chosen
 *   from the code, never from message text, so it stays stable and in one place; the same
 *   function serves the dry-run check and the final create, which share these codes on the server.
 *   An unknown code falls back to the server's own message instead of hiding it.
 *
 * Exports: explainCreateError().
 * Depends on: api/api-error, api/describe-error, types/onboarding.types.
 */

import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import type {
  ExplainProblem,
  FieldProblem,
  ProjectHostChoice,
} from '#/types/onboarding.types.js';

const BY_CODE: Readonly<Record<string, ExplainProblem>> = {
  invalid_local_path: () => ({
    field: 'local_path',
    message: 'That is not a full folder path.',
    fix: 'Paste the whole path, starting at the drive or root, for example C:\\code\\my-app or /home/me/my-app.',
  }),
  path_in_data_home: () => ({
    field: 'local_path',
    message: "That folder is inside Forge's own data folder.",
    fix: 'Choose one of your own folders, somewhere outside the folder shown in the first-run steps.',
  }),
  not_a_directory: () => ({
    field: 'local_path',
    message: 'No folder exists at that path.',
    fix: 'Choose the folder again with Browse.',
  }),
  snapshot_too_large: ({ message }) => ({
    field: 'form',
    message: 'This folder is too large for a first snapshot.',
    fix: `Add a .gitignore for build output and dependencies, or choose Init only on the Git step. ${message}`,
  }),
  base_branch_missing: ({ message }) => ({
    field: 'base_branch',
    message: /no commits yet/.test(message)
      ? 'This repository has no commits yet.'
      : 'That branch does not exist in this repository.',
    fix: /no commits yet/.test(message)
      ? 'Make a first commit in the repository, then check the folder again.'
      : 'Pick one of the branches listed, or check the folder again after creating the branch.',
  }),
  project_exists: () => ({
    field: 'slug',
    message: 'A project with that name already exists.',
    fix: 'Change the name, for example by adding a number at the end.',
  }),
  prefix_in_use: () => ({
    field: 'prefix',
    message: 'Another project already uses that ticket prefix.',
    fix: 'Choose a different prefix of 1 to 10 capital letters or digits; ticket ids would clash otherwise.',
  }),
  path_in_use: () => ({
    field: 'local_path',
    message: 'Another project already uses this folder.',
    fix: 'Open that project from the switcher, or choose a different folder.',
  }),
  connection_not_found: () => ({
    field: 'connection',
    message: 'That GitHub connection no longer exists.',
    fix: 'Choose another connection, or add it again under Forge settings, GitHub.',
  }),
  connection_disabled: () => ({
    field: 'connection',
    message: 'That GitHub connection is switched off.',
    fix: 'Choose another connection, or use local git only.',
  }),
  invalid_settings: ({ message }) => ({
    field: 'checks',
    message: `The checks were not accepted. ${message}`,
    fix: 'Give every check a unique name and a command, then try again.',
  }),
  project_not_servable: ({ host, message }) =>
    host === 'local'
      ? {
          field: 'form',
          message: 'Forge could not set up this project.',
          fix: `Check the folder and its git repository, then try again. ${message}`,
        }
      : {
          field: 'repo',
          message: 'Forge could not set up that GitHub repository.',
          fix: `Check the connection, the repository name and the installation id. ${message}`,
        },
  invalid_request: ({ message }) => ({
    field: 'form',
    message: 'Forge did not accept the form.',
    fix: message,
  }),
  memory_init_failed: ({ message }) => ({
    field: 'form',
    message: "Forge could not create the project's memory repository.",
    fix: `Check that git works on this machine, then try again. ${message}`,
  }),
};

export function explainCreateError(
  error: unknown,
  host: ProjectHostChoice = 'local',
): FieldProblem {
  if (error instanceof ApiError && error.code !== undefined) {
    const explain = BY_CODE[error.code];
    if (explain) {
      return explain({ host, message: error.message });
    }
  }

  const { title, detail } = describeError(error);

  return { field: 'form', message: title, fix: detail };
}
