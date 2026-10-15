/**
 * Tick settings snapshot — the one read of the ConfigSource per tick.
 *
 * Why: settings are edited while the engine runs (d-0085). If every phase asked the source
 *   when it needed a dial, an edit saved mid-tick would let triage run on the old limit and
 *   dispatch on the new one, and a run's recorded version would not match what shaped it.
 *   Taking one snapshot as the tick begins means an edit applies to the next tick as a
 *   whole, with no restart, and every run created in a tick names one consistent version.
 *
 * Exports: loadTickConfig(), isUnservable(), projectSettings(), configVersionRef().
 * Depends on: @forge/core (BUILTIN_PROJECT_SETTINGS, ConfigVersionRef), types/engine,
 *   types/tick. IO only through the ConfigSource and storage ports.
 */

import { BUILTIN_PROJECT_SETTINGS } from '@forge/core';
import type { ConfigVersionRef, ProjectConfigView, ProjectSettings } from '@forge/core';
import type { EngineDeps } from '#/types/engine.types.js';
import type { TickConfig } from '#/types/tick.types.js';

/** A project's effective settings are only valid next to the company version they were merged from. */
const MAX_SNAPSHOT_TRIES = 3;

const isConsistent = (c: TickConfig): boolean =>
  [...c.projects.values()].every((v) => v.version.company === c.companyVersion);

/**
 * Reads the company settings and the settings of every live (not archived) project, once.
 * A project whose stored settings no longer validate is recorded in `unservable` with the
 * reason instead of failing the whole read: one broken project must not stop the others.
 * The company read still throws, since nothing can be decided without it. The source has no
 * multi-read transaction, so a save landing between the reads is detected by comparing the
 * company version each project view was merged from and the read is repeated; a read that
 * never settles marks the mismatched projects unservable for this tick (fail closed) rather
 * than recording a run under a version that did not shape it.
 */
export async function loadTickConfig(deps: EngineDeps): Promise<TickConfig> {
  const slugs = (await deps.storage.transaction((tx) => tx.projects.list()))
    .filter((p) => p.status !== 'archived')
    .map((p) => p.slug);

  let config = await readOnce(deps, slugs);
  for (let i = 1; i < MAX_SNAPSHOT_TRIES && !isConsistent(config); i++) {
    config = await readOnce(deps, slugs);
  }

  if (isConsistent(config)) {
    return config;
  }

  const projects = new Map(config.projects);
  const unservable = new Map(config.unservable);
  for (const [slug, view] of config.projects) {
    if (view.version.company !== config.companyVersion) {
      projects.delete(slug);
      unservable.set(
        slug,
        'settings changed while they were being read; retrying next tick',
      );
    }
  }

  return { ...config, projects, unservable };
}

async function readOnce(deps: EngineDeps, slugs: readonly string[]): Promise<TickConfig> {
  const company = await deps.config.company();
  const projects = new Map<string, ProjectConfigView>();
  const unservable = new Map<string, string>();
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        projects.set(slug, await deps.config.project(slug));
      } catch (e) {
        unservable.set(slug, e instanceof Error ? e.message : String(e));
      }
    }),
  );

  return {
    forge: company.config,
    companyVersion: company.version,
    projects,
    unservable,
  };
}

/** True when `slug`'s stored settings could not be read this tick: nothing may start for it. */
export function isUnservable(config: TickConfig, slug: string): boolean {
  return config.unservable.has(slug);
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
