/**
 * Loads the signed tool catalogue and builds each run's admission context.
 *
 * Why: what a Worker may do is decided by `admit()` over a signed catalogue, the run's
 *   lane grant and the schema hashes of the tools the harness actually sees. The hook
 *   route needs that context for every tool event, so it is assembled here once. The
 *   catalogue is read from the main checkout at startup, never from a Worker's tree
 *   (d-0038). A catalogue that does not verify makes the server refuse to start: running
 *   with no policy would be running with everything denied, or worse, guessed. The live
 *   schema hashes of the Forge tools come from the real `forge` MCP server, so a changed
 *   tool schema is caught as `schema_changed` instead of being trusted. Claude Code does
 *   not report its native tool schemas, so a native tool's pin counts as live only while
 *   the harness build the driver reports is the build the catalogue says was reviewed;
 *   on any other build the native hashes are left out and `admit()` denies those tools as
 *   `schema_changed` until someone re-probes and re-signs (d-0053). A pin compared with
 *   itself would detect nothing. Each run's grant carries the data home, so the floors deny a
 *   Worker everything in Forge's folder except its own worktree (d-0098).
 *
 * Exports: loadToolPolicy().
 * Depends on: @forge/core (Run, PolicyDeniedError), @forge/engine (Logger), @forge/mcp
 *   (computeToolSchemaHashes), @forge/tools (readCatalogueFile, effectiveGrant), types/server,
 *   types/settings. IO: reads the catalogue file.
 */

import { PolicyDeniedError } from '@forge/core';
import type { Logger } from '@forge/engine';
import { computeToolSchemaHashes } from '@forge/mcp';
import { effectiveGrant, readCatalogueFile } from '@forge/tools';
import type { ServerSettings } from '#/types/settings.types.js';
import type { HarnessIdentity, ToolPolicy } from '#/types/server.types.js';

/** Verifies the catalogue (throws PolicyDeniedError when it is quarantined) and returns the policy. */
export async function loadToolPolicy(
  settings: ServerSettings,
  harness: HarnessIdentity,
  log: Logger = () => undefined,
): Promise<ToolPolicy> {
  const catalogue = await readCatalogueFile(
    settings.layout.cataloguePath,
    settings.catalogueKey,
    { allowDevKey: settings.allowDevCatalogueKey },
  );

  if (catalogue.status !== 'verified') {
    throw new PolicyDeniedError(
      `tool catalogue ${settings.layout.cataloguePath} is quarantined (${catalogue.reason}); re-sign it with scripts/sign-catalogue.mjs`,
    );
  }

  const pinned: Record<string, string> = {};
  const unreviewed: string[] = [];
  for (const tool of catalogue.tools.values()) {
    if (tool.kind !== 'harness-native') {
      continue;
    }

    const reviewed = tool.support[harness.id]?.harness_version;
    if (reviewed !== undefined && reviewed === harness.version) {
      pinned[tool.id] = tool.schema_hash;
    } else {
      unreviewed.push(tool.id);
    }
  }

  if (unreviewed.length > 0) {
    log(
      'warn',
      `harness version ${harness.version ?? 'unknown'} not reviewed for native tools; re-probe and re-sign the catalogue (d-0053)`,
      { harness: harness.id, denied: unreviewed },
    );
  }

  const liveSchemaHashes = { ...pinned, ...(await computeToolSchemaHashes()) };

  return {
    catalogueHash: catalogue.hash,
    admitContext: async (run) => ({
      lane: run.lane,
      harness: run.harness,
      catalogue,
      grant: effectiveGrant(run.lane, undefined, undefined, [], {
        dataHome: settings.layout.data.home,
      }),
      liveSchemaHashes,
      cwd: run.cwd,
    }),
  };
}
