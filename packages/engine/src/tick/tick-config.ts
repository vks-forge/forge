/**
 * Tick settings snapshot — the one read of the ConfigSource per tick.
 *
 * Why: settings are edited while the engine runs (d-0085). If every phase asked the source
 *   when it needed a dial, an edit saved mid-tick would let triage run on the old limit and
 *   dispatch on the new one, and a run's recorded version would not match what shaped it.
 *   Taking one snapshot as the tick begins means an edit applies to the next tick as a
 *   whole, with no restart, and every run created in a tick names one consistent version.
 *
 * Exports: loadTickConfig(), projectSettings(), configVersionRef().
 * Depends on: @forge/core (BUILTIN_PROJECT_SETTINGS, ConfigVersionRef), types/engine,
 *   types/tick. IO only through the ConfigSource and storage ports.
 */

import { BUILTIN_PROJECT_SETTINGS } from '@forge/core';
import type { ConfigVersionRef, ProjectConfigView, ProjectSettings } from '@forge/core';
import type { EngineDeps } from '#/types/engine.types.js';
import type { TickConfig } from '#/types/tick.types.js';

/** Reads the company settings and the settings of every registered project, once. */
export async function loadTickConfig(deps: EngineDeps): Promise<TickConfig> {
  const company = await deps.config.company();
  const slugs = (await deps.storage.transaction((tx) => tx.projects.list())).map(
    (p) => p.slug,
  );

  const views = await Promise.all(
    slugs.map(async (slug): Promise<[string, ProjectConfigView]> => [
      slug,
      await deps.config.project(slug),
    ]),
  );

  return {
    forge: company.config,
    companyVersion: company.version,
    projects: new Map(views),
  };
}

/** The effective settings of `slug` in this snapshot; built-in defaults for a project it did not see. */
export function projectSettings(config: TickConfig, slug: string): ProjectSettings {
  return config.projects.get(slug)?.config.project ?? BUILTIN_PROJECT_SETTINGS;
}

/** `c<company>:p<project>` for a run created in this snapshot. */
export function configVersionRef(config: TickConfig, slug: string): ConfigVersionRef {
  const project = config.projects.get(slug)?.version.project ?? 0;

  return `c${config.companyVersion}:p${project}`;
}
