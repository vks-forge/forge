/**
 * ConfigSource contract: one suite every settings backend must pass.
 *
 * Why: the engine reads its limits from this port on every tick and the server writes
 *   them when the user saves Settings. What must hold in every backend: a fresh store
 *   answers with the built-in defaults at version 0 and writes nothing on read; each save
 *   is the next version and old versions stay readable unchanged; a save from a stale
 *   screen is refused with a typed conflict (two racing saves, exactly one wins); the
 *   project layer wins over the company layer; and a bad document is refused before it
 *   is stored (d-0085).
 *
 * Exports: describeConfigSourceContract().
 * Depends on: vitest, @forge/core. IO only through the source under test.
 */

import {
  BUILTIN_CONFIG,
  ConfigVersionConflictError,
  InvalidInputError,
} from '@forge/core';
import type { ConfigSource } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** What the contract needs from a backend: the source and a way to release it. */
export interface ConfigSourceHandle {
  readonly source: ConfigSource;
  close(): Promise<void> | void;
}

const save = (
  source: ConfigSource,
  doc: object,
  expectedVersion: number,
  scope: 'company' | 'project' = 'company',
  project?: string,
) =>
  source.append({
    scope,
    project,
    doc,
    author: 'tester',
    reason: 'because',
    expectedVersion,
  } as never);

/** Register the shared contract; `make` must return a fresh, empty source each call. */
export function describeConfigSourceContract(
  name: string,
  make: () => Promise<ConfigSourceHandle> | ConfigSourceHandle,
): void {
  describe(`ConfigSource contract: ${name}`, () => {
    let handle: ConfigSourceHandle;
    let source: ConfigSource;
    beforeEach(async () => {
      handle = await make();
      source = handle.source;
    });

    afterEach(async () => {
      await handle.close();
    });

    it('answers a fresh store with the built-in defaults at version 0, writing nothing', async () => {
      const company = await source.company();
      const project = await source.project('sf');

      expect(company).toEqual({ config: BUILTIN_CONFIG.forge, version: 0 });
      expect(project).toEqual({
        config: BUILTIN_CONFIG,
        version: { company: 0, project: 0 },
      });

      expect(await source.history('company')).toEqual([]);
    });

    it('saves the next version, applies it, and keeps every version readable', async () => {
      const v1 = await save(source, { engine: { global_slots: 5 } }, 0);
      const v2 = await save(source, { engine: { global_slots: 6 } }, 1);

      expect(v1).toMatchObject({
        scope: 'company',
        project: null,
        version: 1,
        author: 'tester',
        reason: 'because',
      });

      expect(v2.version).toBe(2);
      expect(v2.id).toBeGreaterThan(v1.id);
      expect((await source.company()).version).toBe(2);
      expect((await source.company()).config.engine.global_slots).toBe(6);

      const history = await source.history('company');

      expect(history.map((h) => h.version)).toEqual([1, 2]);
      expect(history[0]?.doc).toEqual({ engine: { global_slots: 5 } });
    });

    it('refuses a save from a stale version and leaves the history alone', async () => {
      await save(source, { engine: { global_slots: 5 } }, 0);

      const stale = save(source, { engine: { global_slots: 9 } }, 0);

      await expect(stale).rejects.toBeInstanceOf(ConfigVersionConflictError);
      await expect(stale).rejects.toMatchObject({ expected: 0, actual: 1 });
      expect(await source.history('company')).toHaveLength(1);
      await expect(save(source, {}, 5)).rejects.toBeInstanceOf(
        ConfigVersionConflictError,
      );
    });

    it('lets exactly one of several racing saves win', async () => {
      const results = await Promise.allSettled(
        [3, 4, 5, 6].map((slots) => save(source, { engine: { global_slots: slots } }, 0)),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await source.history('company')).toHaveLength(1);
    });

    it('layers project over company over built-ins, per project', async () => {
      await save(source, { models: { worker: { standard: 'opus' } } }, 0);
      await save(
        source,
        { default_harness: 'h1', tier_c_globs: ['x/**'] },
        0,
        'project',
        'sf',
      );

      const sf = await source.project('sf');
      const other = await source.project('other');

      expect(sf.version).toEqual({ company: 1, project: 1 });
      expect(sf.config.forge.models.worker.standard).toBe('opus');
      expect(sf.config.project.default_harness).toBe('h1');
      expect(sf.config.project.tier_c_globs).toEqual(['x/**']);
      expect(other.version).toEqual({ company: 1, project: 0 });
      expect(other.config.project).toEqual(BUILTIN_CONFIG.project);
      expect((await source.company()).version).toBe(1);
    });

    it('versions each project separately', async () => {
      await save(source, { default_harness: 'a' }, 0, 'project', 'sf');
      await save(source, { default_harness: 'b' }, 0, 'project', 'web');
      await save(source, { default_harness: 'c' }, 1, 'project', 'sf');

      expect((await source.history('project', 'sf')).map((h) => h.version)).toEqual([
        1, 2,
      ]);

      expect((await source.history('project', 'web')).map((h) => h.version)).toEqual([1]);
      expect((await source.project('web')).config.project.default_harness).toBe('b');
    });

    it('rejects invalid documents and requests without storing anything', async () => {
      const bad: Array<Promise<unknown>> = [
        save(source, { engine: { nope: 1 } }, 0),
        save(source, { engine: { tick_interval_ms: 5 } }, 0),
        save(source, { slug: 'x' }, 0, 'project', 'sf'),
        save(source, {}, 0, 'project'),
        save(source, {}, 0, 'project', 'Bad Slug'),
        source.append({
          scope: 'company',
          doc: {},
          author: '',
          reason: 'r',
          expectedVersion: 0,
        }),
        source.history('project'),
        source.history('company', 'sf'),
      ];

      for (const attempt of bad) {
        await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
      }

      expect(await source.history('company')).toEqual([]);
      expect(await source.history('project', 'sf')).toEqual([]);
    });
  });
}
