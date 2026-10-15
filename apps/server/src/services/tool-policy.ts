/**
 * Builds each run's admission context from the catalogue in the database.
 *
 * Why: what a Worker may do is decided by `admit()` over the tool catalogue, the run's lane
 *   grant, the project's grant and the schema hashes of the tools the harness actually sees.
 *   The hook route needs that context for every tool event, so it is assembled here from
 *   current data each time: an edit to the catalogue or an approval of a tool applies to the
 *   next call with no restart. The catalogue lives in the database outside every worktree
 *   (d-0085); a catalogue that does not load makes the server refuse to start, because
 *   running with no policy would mean everything denied, or worse, guessed. Forge MCP tool
 *   hashes come from the real MCP server, so a changed schema is `schema_changed`. A
 *   harness-native tool is allowed only through an approved schema row for the installed
 *   build (d-0088); a new or changed one is `schema_pending` until the owner approves it, and
 *   an unknown build has no approved rows at all, so every native tool is denied (fail
 *   closed). The project's `tool_grants` come from its effective settings; a malformed grant
 *   fails the call closed. Its checks and ecosystems shape the lane's shell allow-list, so a
 *   Worker can run its own project's tests and lint unattended in any language. Each run's grant carries the data home, so the floors deny a
 *   Worker everything in Forge's folder except its own worktree (d-0098).
 *
 * Exports: createToolPolicy().
 * Depends on: @forge/core (ConfigSource, Run, PolicyDeniedError, StorageAdapter),
 *   @forge/engine (Logger), @forge/mcp (computeToolSchemaHashes), @forge/tools (CatalogueStore,
 *   effectiveCatalogue, effectiveGrant, Grant), services/harness-source, types/server. IO:
 *   reads the catalogue and approval rows.
 */

import { PolicyDeniedError } from '@forge/core';
import { computeToolSchemaHashes } from '@forge/mcp';
import { Grant, effectiveCatalogue, effectiveGrant } from '@forge/tools';
import type { EffectiveCatalogue } from '@forge/tools';
import { DEFAULT_HARNESS } from '#/services/harness-source.js';
import type { ToolPolicy, ToolPolicyDeps } from '#/types/server.types.js';

const KIND = 'claude';

export function createToolPolicy(deps: ToolPolicyDeps): ToolPolicy {
  const forgeHashes = computeToolSchemaHashes();

  /** The catalogue as the installed build sees it. */
  async function effective(): Promise<EffectiveCatalogue> {
    const current = await deps.catalogue.current();
    const version = deps.compat.installedVersion(DEFAULT_HARNESS);
    const rows =
      version === null
        ? []
        : await deps.storage.transaction((tx) =>
            tx.harnessToolSchemas.list(KIND, version),
          );

    return effectiveCatalogue(current.doc, rows);
  }

  return {
    async catalogueHash() {
      const { catalogue } = await effective();
      if (catalogue.status !== 'verified') {
        throw new PolicyDeniedError(
          'the tool catalogue does not load; fix it in Settings or restore the previous version',
        );
      }

      return catalogue.hash;
    },

    admitContext: async (run) => {
      const eff = await effective();
      const view = run.project ? await deps.config.project(run.project) : null;
      const project = view?.config.project;
      const toolGrants = project?.tool_grants;

      return {
        lane: run.lane,
        harness: run.harness,
        catalogue: eff.catalogue,
        grant: effectiveGrant(
          run.lane,
          toolGrants ? Grant.parse(toolGrants) : undefined,
          undefined,
          [],
          { dataHome: deps.dataHome },
          // The Worker may run the project's own checks without asking, in any language.
          project
            ? {
                commands: project.checks.map((c) => c.command),
                ecosystems: project.ecosystems,
              }
            : undefined,
        ),
        liveSchemaHashes: { ...eff.liveSchemaHashes, ...(await forgeHashes) },
        schemaStatus: eff.schemaStatus,
        cwd: run.cwd,
      };
    },
  };
}
