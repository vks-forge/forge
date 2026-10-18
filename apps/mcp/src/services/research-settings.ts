/**
 * Builds a run's research provider from the owner's settings.
 *
 * Why: where a Worker may search and which hosts it may fetch is configuration the owner edits in Forge
 *   settings, stored in the database (code.md rule 9, d-0085, d-0090); a per-run process that read only
 *   environment variables left web search unconfigured in production. This reads the effective settings of
 *   the run's project (run, then its project, then the company's settings with the project's narrowing),
 *   builds the one `ResearchProvider` and the host limits, and treats the old environment variables as a
 *   dev override only. Anything that goes wrong reading settings, or a project that switched research off,
 *   leaves the Worker with no web tools rather than failing the whole MCP server or widening access.
 *
 * Exports: resolveResearch().
 * Depends on: @forge/core (effectiveResearch, ConfigSource, StorageAdapter), @forge/mcp (types),
 *   @forge/research (createResearchProvider), types/start.types. IO: reads settings and storage.
 */

import { effectiveResearch } from '@forge/core';
import type { ConfigSource, ResearchSettings, StorageAdapter, Ticket } from '@forge/core';
import type { ForgeMcpDeps } from '@forge/mcp';
import { createResearchProvider } from '@forge/research';
import type { ResearchOverride } from '#/types/start.types.js';

async function projectSlug(
  storage: StorageAdapter,
  runId: string,
): Promise<string | null> {
  return storage.transaction(async (tx) => {
    const run = await tx.runs.get(runId);
    if (!run) {
      return null;
    }

    if (run.project !== undefined) {
      return run.project;
    }

    return (await tx.tickets.get(run.ticket_id as Ticket['id']))?.project ?? null;
  });
}

function overridden(settings: ResearchSettings, o: ResearchOverride): ResearchSettings {
  return {
    ...settings,
    provider: o.searxngUrl ? 'searxng' : settings.provider,
    searxng: o.searxngUrl
      ? { base_url: o.searxngUrl, allow_hosts: [...o.searxngAllowHosts] }
      : settings.searxng,
    fetch:
      o.fetchAllowHosts.length > 0
        ? { ...settings.fetch, allow_hosts: [...o.fetchAllowHosts] }
        : settings.fetch,
  };
}

/** The provider and limits for `runId`; no provider when research is off or the settings cannot be read. */
export async function resolveResearch(
  storage: StorageAdapter,
  config: ConfigSource,
  runId: string,
  override: ResearchOverride,
): Promise<Pick<ForgeMcpDeps, 'research' | 'researchLimits'>> {
  try {
    const slug = await projectSlug(storage, runId);
    const view = slug === null ? null : await config.project(slug);
    const company =
      view?.config.forge.research ?? (await config.company()).config.research;

    const settings = overridden(company, override);
    const effective = effectiveResearch(settings, view?.config.project.research);
    if (!effective.enabled) {
      return {};
    }

    return {
      research: createResearchProvider(settings),
      researchLimits: {
        allowHosts: effective.allowHosts,
        denyHosts: effective.denyHosts,
        timeoutMs: settings.fetch.timeout_ms,
      },
    };
  } catch {
    return {};
  }
}
