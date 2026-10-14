/**
 * Assembles the Forge server: config, adapters, engine, HTTP, clock and shutdown.
 *
 * Why: this is the composition root (code.md rule 1). It is the only place that opens the
 *   database (and runs its migrations, which the server owns), creates worktrees, builds
 *   the hook ingress and starts a socket. It holds no logic of its own: it picks adapters
 *   from config, hands them to the engine and the routes, and returns a small handle. The
 *   Worker driver and the Director's model arrive as ports, so production passes the Claude
 *   adapters and the end-to-end test passes fakes through the same assembly, the same hook
 *   route, the same receipts and the same G1 gate. A failure while assembling closes the
 *   database again, so a bad config never leaves a locked file behind.
 *
 * Exports: assembleServer().
 * Depends on: @forge/db, @forge/drivers (systemClock), @forge/engine, @forge/git, @forge/hooks,
 *   @forge/memory, @forge/secrets, @forge/tools, and the services/routes of this app.
 *   IO: opens SQLite, creates the data home, binds the port on `start()`.
 */

import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { Project } from '@forge/core';
import { openSqlite } from '@forge/db';
import { createReceiptLookup, systemClock } from '@forge/drivers';
import { createEngine, createIdSource, createOwnerId } from '@forge/engine';
import { createFileReportStore } from '@forge/gates';
import { createGitWorktreeManager } from '@forge/git';
import {
  createHookHandler,
  createLivenessRecorder,
  createRunSecretRegistry,
} from '@forge/hooks';
import { createFileMemorySource } from '@forge/memory';
import { createDpapiSecretStore, createMemorySecretStore } from '@forge/secrets';
import { admit } from '@forge/tools';
import { buildRoutes } from '#/routes/routes.js';
import { createGates } from '#/services/gates.js';
import { createProjectGitHost } from '#/services/git-host.js';
import { assertLoopbackBind, closeServer, listen } from '#/services/http/listen.js';
import { createRouter } from '#/services/http/router.js';
import { createPrepareRun } from '#/services/prepare-run.js';
import { shutdownServer } from '#/services/shutdown.js';
import { createTicker } from '#/services/ticker.js';
import { loadToolPolicy } from '#/services/tool-policy.js';
import type { ExternalPorts, ForgeServer, ServerAddress } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

/** The `projects` row for the one project this server works on. */
function projectRow(settings: ServerSettings): Project {
  const { project } = settings;

  return {
    id: project.slug,
    slug: project.slug,
    prefix: project.prefix,
    ...(project.remote ? { repo_origin: project.remote } : {}),
    harness_defaults: { default_harness: project.default_harness },
    tier_c_globs: [...project.tier_c_globs],
  };
}

/** Builds the server; nothing listens and no tick runs until `start()`. */
export async function assembleServer(
  settings: ServerSettings,
  ports: ExternalPorts,
): Promise<ForgeServer> {
  assertLoopbackBind(settings.host);
  const { layout, project } = settings;
  const log = ports.log ?? (() => undefined);
  const clock = ports.clock ?? systemClock;
  const now = (): number => clock.now();

  await mkdir(dirname(layout.data.dbPath), { recursive: true });
  const { storage, receipts } = openSqlite(layout.data.dbPath);

  try {
    const owner = createOwnerId();
    const registry = createRunSecretRegistry();

    const worktrees = createGitWorktreeManager({
      repoRoot: layout.repoRoot,
      worktreeRoot: join(layout.data.worktreesDir, project.slug),
    });

    const secrets =
      ports.secrets ??
      (project.git_host?.kind === 'github'
        ? createDpapiSecretStore({ dir: layout.data.secretsDir })
        : createMemorySecretStore());

    const gitHost = createProjectGitHost(project, {
      root: layout.repoRoot,
      secrets,
      now,
    });

    const gates = createGates({
      storage,
      receipts,
      worktrees,
      registry,
      env: settings.env,
    });

    const runtime = gitHost ? { config: project, gitHost, gates } : null;

    let address: ServerAddress | null = null;
    const prepareRun = createPrepareRun({
      runsDir: layout.data.runsDir,
      dbPath: layout.data.dbPath,
      mcpEntry: layout.mcpEntry,
      nodePath: process.execPath,
      registry,
      hookBaseUrl: () => {
        if (!address) {
          throw new InvalidInputError(
            'a run was prepared before the server was listening',
          );
        }

        return address.url;
      },
    });

    const driver = ports.driver({
      prepareRun,
      receipts: createReceiptLookup(receipts),
      log,
    });

    const preflight = await driver.preflight();
    if (!preflight.ok) {
      log('warn', 'worker driver preflight reported issues', {
        issues: preflight.issues,
      });
    }

    const policy = await loadToolPolicy(
      settings,
      { id: driver.id, version: preflight.harnessVersion ?? null },
      log,
    );

    await storage.transaction((tx) => tx.projects.upsert(projectRow(settings)));

    const ticker = createTicker({
      tick: () => engine.tick(),
      intervalMs: settings.forge.engine.tick_interval_ms,
      log,
    });

    const engine = createEngine({
      storage,
      driver,
      llm: ports.llm,
      worktrees,
      memory: createFileMemorySource(layout.memoryDir, {
        onSkip: (path, reason) => log('warn', 'memory record skipped', { path, reason }),
      }),
      receipts,
      reports: createFileReportStore(layout.data.home),
      project: (slug) => (runtime && slug === project.slug ? runtime : null),
      clock,
      config: settings.forge,
      ids: ports.ids ?? createIdSource(),
      owner,
      baseRef: project.git_host?.base_branch ?? 'main',
      catalogueHash: policy.catalogueHash,
      onTickRequested: ticker.requestTick,
      log,
    });

    const hooks = createHookHandler({
      db: storage,
      receipts,
      admit,
      credentials: registry.credentials,
      admitContext: policy.admitContext,
      clock: () => new Date(now()),
      requireLiveness: true,
      onLiveness: createLivenessRecorder({
        storage,
        now: () => new Date(now()),
        onRegistered: ticker.requestTick,
      }),
      audit: (runId, entry) =>
        log('warn', 'hook request refused', {
          run: runId,
          code: entry.code,
          suppressed: entry.suppressed,
        }),
    });

    const streams = new AbortController();
    const router = createRouter(
      buildRoutes({
        engine,
        storage,
        hooks,
        owner,
        startedAt: now(),
        now,
        http: settings.http,
        shutdown: streams.signal,
      }),
    );

    const http = createServer((req, res) => {
      void router.dispatch(req, res);
    });

    let stopping: Promise<void> | null = null;

    return {
      owner,
      storage,
      receipts,
      engine,
      runSecrets: registry,
      address: () => address,
      async start() {
        if (address) {
          return address;
        }

        const port = await listen(http, settings.host, settings.port);
        address = { host: settings.host, port, url: `http://${settings.host}:${port}` };
        ticker.start();
        log('info', 'server listening', { url: address.url, owner });

        return address;
      },
      stop() {
        stopping ??= shutdownServer({
          ticker,
          engine,
          driver,
          storage,
          endStreams: () => streams.abort(),
          closeHttp: () => closeServer(http),
          disposePorts: ports.dispose,
          graceMs: settings.shutdownGraceMs,
          log,
        });

        return stopping;
      },
    };
  } catch (error) {
    await storage.close().catch(() => undefined);
    throw error;
  }
}
