/**
 * Known-project config: settings are only served for registered projects.
 *
 * Why: a slug with no saved settings reads as "defaults at version 0". For a slug that is
 *   not a project (a typo, a removed project) that would let a run start on defaults and
 *   record `p0`, hiding the mistake. The wrapper must turn it into a typed not-found, while
 *   leaving company reads, writes and real projects untouched.
 *
 * Pins: an unknown slug is a ProjectNotFoundError from project() and from a project
 *   history(); a registered project reads as before (version 0 until saved); company reads
 *   and appends do not need a project.
 * Depends on: @forge/db (memory), src/services/known-project-config. IO: none.
 */

import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import { ProjectNotFoundError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { withKnownProjects } from '#/services/known-project-config.js';

async function make() {
  const storage = createMemoryStorage();
  await storage.transaction((tx) =>
    tx.projects.upsert({
      id: 'forge',
      slug: 'forge',
      prefix: 'FG',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    }),
  );

  return withKnownProjects(createMemoryConfigSource(), storage);
}

describe('withKnownProjects', () => {
  it('refuses the settings and history of a slug that is not a project', async () => {
    const config = await make();

    await expect(config.project('typo')).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(config.history('project', 'typo')).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('serves a registered project, at version 0 until it is saved', async () => {
    const config = await make();

    expect((await config.project('forge')).version).toEqual({ company: 0, project: 0 });
    expect(await config.history('project', 'forge')).toEqual([]);
  });

  it('leaves company reads and writes alone', async () => {
    const config = await make();

    const saved = await config.append({
      scope: 'company',
      doc: {},
      author: 'test',
      reason: 'edit',
      expectedVersion: 0,
    });

    expect(saved.version).toBe(1);
    expect((await config.company()).version).toBe(1);
    expect(await config.history('company')).toHaveLength(1);
  });
});
