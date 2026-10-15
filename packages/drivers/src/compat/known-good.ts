/**
 * Harness builds this release already verified, with the schema hash of each built-in tool.
 *
 * Why: the first sight of an installed build triggers a compatibility check (d-0088). For a
 *   build that Forge's own release was tested against, running it again on every machine
 *   would only delay the first ticket. Such a build is recorded as compatible straight away
 *   and its tools are approved with the hashes captured when it was verified (decided by
 *   `forge-release`, so the owner can tell them from their own approvals). The list is data,
 *   not logic: a build is added by running the check on a clean machine and copying the
 *   captured hashes here in the same change that was tested, and a build is never added on
 *   assumption. Hashes cover the tool names and input schemas as the model API receives
 *   them, so the Windows shell tool (`PowerShell` and `Bash`) is part of the `shell` hash.
 *
 * Exports: KNOWN_GOOD_BUILDS, findKnownGood().
 * Depends on: types/compat. No IO.
 */

import type { KnownGoodBuild } from '#/types/compat/compat.types.js';

/**
 * Captured on Windows through the ACP engine (the shell hash covers the tools that engine offers:
 * `Bash`). 2.1.293 is the build the adapter bundles; 2.1.299 is the build the owner runs here.
 * 2.1.296 was not captured (not installed on the machine that built this list) and is left to be
 * approved by the check.
 */
export const KNOWN_GOOD_BUILDS: readonly KnownGoodBuild[] = [
  {
    version: '2.1.293',
    tools: {
      read: 'sha256:cb019917fd0f8a760123d658eec2fdab85449080641a5cde01d7ea6883693a92',
      glob: 'sha256:29ac1927b1571b77bdfc1c6d7ba2119ae9cffc06802988c4431c790e01747557',
      grep: 'sha256:87eedb2ef2fb0095aabfcf4aa9b9f052c6a56e7b80ce5ede489bdd5b80f93ea2',
      edit: 'sha256:863d9447bf0a104d509bac661ef7aa444dfd5778c5afa04cc99042de9c56583d',
      write: 'sha256:fdc0c7b5bec15825e1317b10fbbd2fdef9123447f7db9c3b0a397b835f4657cb',
      shell: 'sha256:4f3e95d5471e5c42ade324dc824bc170e3042ff488cbb519b679775aaa99de1f',
      task: 'sha256:d4227849ebcf4454e3829e18b73bf441494f85cf0922ce438d9987b5c569151d',
    },
  },
  {
    version: '2.1.299',
    tools: {
      read: 'sha256:ab84e6e73fc44204416bac0233ebbac1605712089ddff2451fdee6c0bc82e502',
      glob: 'sha256:29ac1927b1571b77bdfc1c6d7ba2119ae9cffc06802988c4431c790e01747557',
      grep: 'sha256:87eedb2ef2fb0095aabfcf4aa9b9f052c6a56e7b80ce5ede489bdd5b80f93ea2',
      edit: 'sha256:863d9447bf0a104d509bac661ef7aa444dfd5778c5afa04cc99042de9c56583d',
      write: 'sha256:fdc0c7b5bec15825e1317b10fbbd2fdef9123447f7db9c3b0a397b835f4657cb',
      shell: 'sha256:4f3e95d5471e5c42ade324dc824bc170e3042ff488cbb519b679775aaa99de1f',
      task: 'sha256:d4227849ebcf4454e3829e18b73bf441494f85cf0922ce438d9987b5c569151d',
    },
  },
];

/** The shipped record for `version`, or undefined when this release never verified it. */
export function findKnownGood(version: string): KnownGoodBuild | undefined {
  return KNOWN_GOOD_BUILDS.find((b) => b.version === version);
}
