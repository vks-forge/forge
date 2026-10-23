/**
 * Setup facts: the stored state a setup escalation is checked against.
 *
 * Why: whether a login, a tool approval or a harness build has been fixed is decided from what
 *   Forge already stores (the harness row and its last test, the tool-schema row, the tool
 *   catalogue, the project's tool grant, the build's compatibility row), never by probing the
 *   harness, so the check is cheap enough to run every tick and for the owner's "I fixed it,
 *   check again". This reads those rows for one escalation; the rule that compares them is the
 *   pure `isSetupFixed` in core.
 *
 * Exports: setupFactsFor(). A failed worktree setup is judged by the project's settings version.
 * Depends on: @forge/core (SetupCause, SetupFacts, project settings), types/engine. Reads storage and the tool catalogue port.
 */

import type { ProjectSettings, SetupCause, SetupFacts, StorageTx } from '@forge/core';
import type { EngineDeps } from '#/types/engine.types.js';

/** The facts that bear on `cause`; `settings` are the project's current settings. */
export async function setupFactsFor(
  deps: Pick<EngineDeps, 'toolCatalogued'>,
  tx: StorageTx,
  cause: SetupCause,
  settings: ProjectSettings,
  settingsVersion = 0,
): Promise<SetupFacts> {
  switch (cause.type) {
    case 'login': {
      const harness = await tx.harnesses.get(cause.harness_id);

      return {
        harness: harness
          ? {
              status: harness.status,
              ...(harness.last_checked_at === undefined
                ? {}
                : { last_checked_at: harness.last_checked_at }),
            }
          : null,
      };
    }

    case 'tool': {
      const schema = await tx.harnessToolSchemas.get(
        cause.harness_kind,
        cause.version,
        cause.tool,
      );

      return {
        toolSchema: schema ? { status: schema.status } : null,
        catalogued: (await deps.toolCatalogued?.(cause.tool)) ?? false,
        granted: settings.tool_grants?.allow?.includes(cause.tool) ?? false,
      };
    }

    case 'harness_build': {
      const build = await tx.harnessVersions.get(cause.harness_kind, cause.version);
      if (!build) {
        return { build: null };
      }

      // A passing check leaves new or changed tools pending; the run is only worth trying
      // again when the owner has decided them all.
      const tools = await tx.harnessToolSchemas.list(cause.harness_kind, cause.version);

      return {
        build: {
          compat: build.compat,
          pending_tools: tools.filter((t) => t.status === 'pending').length,
        },
      };
    }

    case 'worktree_setup':
      // The owner fixes a failed install by saving new setup steps: a newer settings version.
      return { setup_version: settingsVersion };
  }
}
