/**
 * Builds what decides whether a Worker may run: build compatibility, build check, tool policy.
 *
 * Why: three parts depend on each other and must start in one order. The compatibility
 *   service learns the installed harness build (and checks it in the background when it is
 *   new), the build check refuses a run start on a build whose approvals were not loaded,
 *   and the tool policy judges every tool call by the approvals of that build. Putting them
 *   in one factory keeps the assembly short and the order in one place: the build is observed
 *   before the policy is built, and a tool catalogue that does not load stops the server at
 *   start, not at the first tool call.
 *
 * Exports: composeHarnessGuard().
 * Depends on: services/{build-check,harness-compat,harness-source,tool-policy},
 *   types/harness-compat, types/harness-guard. IO: reads storage and
 *   the catalogue; observing the build may spawn `claude --version`.
 */

import { createBuildCheck } from '#/services/build-check.js';
import { createHarnessCompat } from '#/services/harness-compat.js';
import { DEFAULT_HARNESS } from '#/services/harness-source.js';
import { createToolPolicy } from '#/services/tool-policy.js';
import type { HarnessGuardDeps } from '#/types/harness-guard.types.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

/** The compatibility service, the pre-start build check and the tool policy, built in dependency order. */
export async function composeHarnessGuard(deps: HarnessGuardDeps): Promise<{
  readonly compat: HarnessCompat;
  readonly checkBuild: (runId: string) => Promise<void>;
  readonly policy: ReturnType<typeof createToolPolicy>;
}> {
  const { storage, catalogue } = deps;
  const compat = createHarnessCompat({
    storage,
    catalogue,
    port: deps.port,
    supportKey: deps.supportKey,
    now: deps.now,
    log: deps.log,
  });

  // Reads the installed build; a build seen for the first time is checked in the background.
  await compat.observe(DEFAULT_HARNESS);

  const policy = createToolPolicy({
    storage,
    catalogue,
    config: deps.config,
    compat,
    dataHome: deps.dataHome,
  });

  // A catalogue that does not load stops the server here, not at the first tool call.
  await policy.catalogueHash();

  return {
    compat,
    policy,
    checkBuild: createBuildCheck({ compat, storage, harnessId: DEFAULT_HARNESS }),
  };
}
