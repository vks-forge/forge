/**
 * Builds the memory scope of a run from its agent, in the MCP process.
 *
 * Why: a Worker reads project memory through three read-only tools, and what it may see is decided by its agent
 *   (d-0078) through the run's own rows and the owner's saved settings, never by anything the Worker sends: the
 *   tags the agent cares about and whether it sees rejected approaches. The scope is rebuilt from the current
 *   settings on every call, so an owner who narrows an agent mid-run tightens the next call. A run that records
 *   no agent (an older run) sees what every Worker saw before agents existed, the whole project with its
 *   rejected approaches; an agent the settings no longer list gets the narrowest scope, never the widest; and a
 *   run, ticket or project that cannot be found gets none, so the tools answer `not_found` (code.md rule 6: fail
 *   closed). Proposals, outcomes and superseded records are never in any scope.
 *
 * Exports: memoryScopeResolver().
 * Depends on: @forge/core (effectiveAgents, workerScope, ConfigSource, StorageAdapter), @forge/mcp (types).
 *   IO: reads storage and settings.
 */

import { effectiveAgents, workerScope } from '@forge/core';
import type { ConfigSource, Ticket, StorageAdapter } from '@forge/core';
import type { WorkerMemoryScope } from '@forge/mcp';

const NO_PROJECT_AGENTS = { custom: {}, overrides: {}, disabled: [] };

/** `runId` to the run's project, ticket and scope, or null when any of them is unknown or settings cannot be read. */
export function memoryScopeResolver(
  storage: StorageAdapter,
  config: ConfigSource,
): (runId: string) => Promise<WorkerMemoryScope | null> {
  return async (runId) => {
    try {
      const placed = await storage.transaction(async (tx) => {
        const run = await tx.runs.get(runId);
        const ticket = run ? await tx.tickets.get(run.ticket_id as Ticket['id']) : null;
        const project = run?.project ?? ticket?.project;

        return run && ticket && project !== undefined
          ? { project, ticket: ticket.id, agent: run.agent_id }
          : null;
      });

      if (placed === null) {
        return null;
      }

      if (placed.agent === undefined) {
        return {
          project: placed.project,
          ticket_id: placed.ticket,
          scope: workerScope({ tags: [], include_rejected: true }),
        };
      }

      const view = await config.project(placed.project);
      const found = effectiveAgents(
        view.config.forge.agents,
        view.config.project.agents ?? NO_PROJECT_AGENTS,
        () => ({ ready: true, reasons: [] }),
      ).find((v) => v.id === placed.agent)?.definition.memory;

      return {
        project: placed.project,
        ticket_id: placed.ticket,
        scope: workerScope(found ?? { tags: [], include_rejected: false }),
      };
    } catch {
      return null;
    }
  };
}
