/**
 * Rig for the local bare-repo host tests: a throwaway remote, a host over it, and a push helper.
 *
 * Why: the contract suite and the merge-safety suite both start from "a branch pushed to a
 *   bare repo through the host, as the engine would". Building it once keeps each suite
 *   about the behaviour it pins.
 *
 * Exports: T0, hostFor(), push().
 * Depends on: helpers/local-remote, src/index.
 */

import { createLocalBareGitHost } from '#/index.js';
import { git } from '#tests/helpers/local-remote.js';
import type { LocalRemote } from '#tests/helpers/local-remote.js';

export const T0 = Date.parse('2026-10-13T10:00:00.000Z');

export const hostFor = (r: LocalRemote) =>
  createLocalBareGitHost({ remotePath: r.remotePath, baseBranch: 'main', now: () => T0 });

/** Commits a branch in the clone and pushes it through the host, as the engine would. */
export async function push(
  r: LocalRemote,
  branch: string,
  file: string,
  content: string,
) {
  const host = hostFor(r);
  const sha = await r.commitOnBranch(branch, file, content);
  await git(r.work, 'checkout', branch);
  await host.push(r.work, branch);
  await git(r.work, 'checkout', 'main');

  return { host, sha };
}
