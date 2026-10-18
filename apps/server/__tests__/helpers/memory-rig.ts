/**
 * An HTTP rig with the real memory routes over a real SQLite file, a temp data home and real composition.
 *
 * Why: the memory API, the start-up migration and the live announcements only mean something together: a
 *   project's old git repository on disk, the import log in the database, the routed memory choosing a backend,
 *   the routes reading through the index, and the tracked storage announcing a write. This builds exactly that
 *   (the production `composeProjectMemory` and route table, a database file so the backup can snapshot it)
 *   without an engine, a harness or a whole server, so each test file is about one behaviour.
 *
 * Exports: MemoryRig, startMemoryRig(), oldRepo().
 * Depends on: @forge/db, @forge/core, @forge/memory (git runner is reached through a real repo made by git),
 *   src/routes, src/services/{project-memory,tracked-storage,project-events}, helpers/{http-rig,route-extras}.
 *   IO: a loopback socket, a temp folder, `git`, SQLite.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Project, StorageAdapter } from '@forge/core';
import { createMemoryConfigSource, createSqliteStorage } from '@forge/db';
import type { Engine } from '@forge/engine';
import { createMemorySecretStore } from '@forge/secrets';
import { vi } from 'vitest';
import { buildRoutes } from '#/routes/routes.js';
import { createProjectEvents } from '#/services/project-events.js';
import { createProjectRegistry } from '#/services/project-registry.js';
import { composeProjectMemory } from '#/services/project-memory.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';
import type { MemoryParts } from '#/types/memory-admin.types.js';
import { stubHarnessDeps } from '#tests/helpers/harness-deps.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { inertRouteExtras } from '#tests/helpers/route-extras.js';

export interface MemoryRig {
  readonly rig: HttpRig;
  readonly root: string;
  readonly storage: StorageAdapter;
  readonly parts: MemoryParts;
  readonly dataHome: {
    home: string;
    memoryDir: string;
    backupsDir: string;
    dbPath: string;
  };
  /** What the server logged, as `level message {fields}`. */
  readonly logs: string[];
  /** Starts recording the query keys announced for `slug` (JSON of each key, one list per announcement). */
  watch(slug: string): string[][];
  addProject(slug: string): Promise<void>;
  /** Moves the clock forward (ms) for the next calls. */
  tick(ms: number): void;
  close(): Promise<void>;
}

const row = (slug: string): Project => ({
  id: slug,
  slug,
  prefix: slug.slice(0, 2).toUpperCase(),
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
});

/** Makes `<memoryDir>/<slug>` a git repository holding `files` in one commit, as an earlier release left it. */
export function oldRepo(
  memoryDir: string,
  slug: string,
  files: Record<string, string>,
): string {
  const dir = join(memoryDir, slug);
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]): void => {
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: dir, stdio: 'ignore' },
    );
  };

  git('init');
  for (const [rel, text] of Object.entries(files)) {
    const path = join(dir, ...rel.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  }

  git('add', '-A');
  git('commit', '-m', 'seed');

  return dir;
}

/** Starts the rig; `prepare` runs after the data home exists and before memory is composed (put old repositories there). */
export async function startMemoryRig(
  prepare?: (dataHome: MemoryRig['dataHome']) => void | Promise<void>,
): Promise<MemoryRig> {
  const root = mkdtempSync(join(tmpdir(), 'forge-memrig-'));
  const dataHome = {
    home: root,
    memoryDir: join(root, 'memory'),
    backupsDir: join(root, 'backups'),
    dbPath: join(root, 'forge.db'),
  };

  mkdirSync(dataHome.memoryDir, { recursive: true });
  await prepare?.(dataHome);

  const events = createProjectEvents();

  const raw = createSqliteStorage(dataHome.dbPath);
  const storage = trackProjectWrites(raw, events);
  let clock = Date.parse('2026-10-18T12:00:00.000Z');
  const now = (): number => clock;
  const logs: string[] = [];
  const log = (
    level: string,
    message: string,
    fields?: Record<string, unknown>,
  ): void => {
    logs.push(
      `${level} ${message} ${fields === undefined ? '' : JSON.stringify(fields)}`,
    );
  };

  const parts = await composeProjectMemory({ storage, dataHome, now, log, slugs: [] });
  const config = createMemoryConfigSource();
  const secrets = createMemorySecretStore();
  const extras = inertRouteExtras();
  const registry = createProjectRegistry({
    storage,
    config,
    secrets,
    worktreesDir: join(root, 'worktrees'),
    gates: () => [],
    now: () => 0,
    log: () => undefined,
  });

  const rig = await startHttp(
    buildRoutes({
      engine: {
        liveRunIds: vi.fn(() => []),
        unservableProjects: () => new Map(),
      } as unknown as Engine,
      storage,
      config,
      projects: registry,
      memory: parts.memory,
      memoryIndex: parts.index,
      memoryAdmin: parts.admin,
      ...stubHarnessDeps(),
      catalogue: extras.catalogue,
      compat: extras.compat,
      triggers: extras.triggers,
      tickets: extras.tickets,
      projectEvents: events,
      sessions: extras.sessions,
      prover: extras.prover,
      requestShutdown: extras.requestShutdown,
      secrets,
      dataHome: {
        home: root,
        memoryDir: dataHome.memoryDir,
        worktreesDir: join(root, 'worktrees'),
      },
      hooks: { handle: vi.fn() },
      owner: 'srv-test',
      startedAt: 0,
      now,
      http: { ssePollMs: 5, sseHeartbeatMs: 1000 },
      shutdown: new AbortController().signal,
    }),
  );

  return {
    rig,
    root,
    storage,
    parts,
    dataHome,
    logs,
    watch: (slug) => {
      const seen: string[][] = [];
      events.subscribe(slug, (keys) => seen.push(keys.map((k) => JSON.stringify(k))));

      return seen;
    },
    addProject: (slug) => storage.transaction((tx) => tx.projects.upsert(row(slug))),
    tick: (ms) => {
      clock += ms;
    },
    close: async () => {
      await rig.close();
      await storage.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
