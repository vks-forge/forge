/**
 * Starts the real server over a fixture repository for the end-to-end tests.
 *
 * Why: every end-to-end scenario needs the same setup: a fixture repo and bare remote, the
 *   settings loaded as production does, the fixture registered through `POST /projects`, the real
 *   assembly (SQLite in the fixture, worktrees, hook route, G1, local-bare host) listening on
 *   an ephemeral loopback port, and only the Worker harness and the Director's model
 *   replaced by fakes. One rig keeps the scenarios about behaviour, not plumbing.
 *
 * Exports: E2eRig, startE2eRig(), intakeBody().
 * Depends on: src/config, src/services/assemble, helpers/fixture-repo, helpers/fake-worker-driver,
 *   helpers/scripted-llm. IO: git, SQLite, a loopback socket.
 */

import { loadSettings } from '#/config/load-settings.js';
import { assembleServer } from '#/services/assemble.js';
import type { ForgeServer, ServerAddress } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';
import { createFixtureRepo, fixtureProjectBody } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { createFakeWorker } from '#tests/helpers/fake-worker-driver.js';
import type { Behaviour, FakeWorker } from '#tests/helpers/fake-worker-driver.js';
import { createScriptedDirector } from '#tests/helpers/scripted-llm.js';
import type { ScriptedDirector } from '#tests/helpers/scripted-llm.js';

export interface E2eRig {
  readonly server: ForgeServer;
  readonly address: ServerAddress;
  readonly fixture: FixtureRepo;
  readonly settings: ServerSettings;
  readonly worker: FakeWorker;
  readonly director: ScriptedDirector;
  /** Server log lines (`level message fields`), for failure diagnostics. */
  readonly logs: string[];
  /** JSON request to the server; returns the status and parsed body. */
  call(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: unknown }>;
  dispose(): Promise<void>;
}

/** An intake event asking for the `add` function, unique per `key`. */
export function intakeBody(key: string): Record<string, unknown> {
  return {
    source: 'chat',
    kind: 'new_request',
    dedupe_key: key,
    actor: { type: 'user', id: 'tester' },
    project: 'fixture',
    payload: { text: 'Add a function add(a, b) to src/math.js and a test for it.' },
    received_at: new Date().toISOString(),
  };
}

/** `behaviours` script the fake Worker run by run (the last one repeats). */
export async function startE2eRig(behaviours: readonly Behaviour[]): Promise<E2eRig> {
  const fixture = createFixtureRepo();
  const director = createScriptedDirector();
  const logs: string[] = [];
  let worker: FakeWorker | undefined;
  let server: ForgeServer | undefined;

  try {
    const loaded = await loadSettings(
      // The real environment: G1 resolves `npm` through PATH, which a literal env would lack.
      {
        ...process.env,
        FORGE_ROOT: fixture.root,
        FORGE_HOME: fixture.dataHome,
        FORGE_PORT: '0',
        NODE_ENV: 'test',
      },
      fixture.root,
    );

    // Short polling so the SSE scenarios finish in milliseconds, not half-seconds.
    const settings: ServerSettings = {
      ...loaded,
      http: { ssePollMs: 25, sseHeartbeatMs: 15_000 },
      shutdownGraceMs: 2_000,
    };

    server = await assembleServer(settings, {
      llm: director.llm,
      log: (level, message, fields) =>
        logs.push(`${level} ${message} ${fields ? JSON.stringify(fields) : ''}`),
      driver: (deps) => {
        worker = createFakeWorker(deps, () => server as ForgeServer, behaviours);

        return worker.driver;
      },
    });

    const address = await server.start();
    const live = server;
    const call: E2eRig['call'] = async (method, path, body, headers = {}) => {
      const res = await fetch(`${address.url}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const text = await res.text();

      return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
    };

    // The project is registered the way a user does it, never by touching the database.
    const registered = await call('POST', '/projects', fixtureProjectBody(fixture));
    if (registered.status !== 201) {
      throw new Error(
        `could not register the fixture project: ${JSON.stringify(registered.body)}`,
      );
    }

    return {
      server: live,
      address,
      fixture,
      settings,
      worker: worker as FakeWorker,
      director,
      logs,
      call,
      async dispose() {
        await live.stop();
        fixture.dispose();
      },
    };
  } catch (error) {
    await server?.stop();
    fixture.dispose();
    throw error;
  }
}
