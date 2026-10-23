/**
 * Fixture for a failed workspace setup as the server sends it: an install step that stopped before
 * a Worker started.
 *
 * Why: the setup card, the dock, the Inbox and the settled line all read the same payload (the
 *   step, its exact command, the exit code, the last output, the settings version the owner has to
 *   move past), so every test builds it from one shape that follows core's `worktree_setup` cause
 *   (d-0180). The default command is not a Node one on purpose, so no copy quietly assumes npm.
 *
 * Exports: worktreeSetupView().
 * Depends on: helpers/escalation-world (shape of an escalation view). No IO.
 */

import { escalationBase } from '#tests/helpers/escalation-world.js';

type Raw = Record<string, unknown>;

/** A setup step that failed on the project's own files; `cause` overrides parts of the cause. */
export function worktreeSetupView(cause: Raw = {}, over: Raw = {}): Raw {
  return escalationBase({
    id: 'int-w1',
    kind: 'setup',
    payload: {
      kind: 'setup',
      cause: {
        type: 'worktree_setup',
        step: 'Install packages',
        command: 'uv sync --frozen',
        exit_code: 2,
        timed_out: false,
        tail: 'Resolving dependencies...\nerror: lockfile is out of date',
        settings_version: 3,
        ...cause,
      },
      summary: 'Forge could not get the workspace ready: Install packages',
      fix_href: '/p/sample-service/settings/checks#setup',
    },
    actions: ['retry', 'skip_setup', 'cancel'],
    ...over,
  });
}
