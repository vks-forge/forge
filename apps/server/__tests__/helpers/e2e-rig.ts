/**
 * Starts the real server over a fixture repository for the end-to-end tests.
 *
 * Why: every end-to-end scenario needs the same setup: a fixture repo and bare remote, the
 *   settings loaded as production does, the fixture registered through `POST /projects`, the real
 *   assembly (SQLite in the fixture, worktrees, hook route, G1, local-bare host) listening on
 *   an ephemeral loopback port, and only the Worker harness and the Director's model
 *   replaced by fakes. Requests carry the install token the server wrote into the fixture's
 *   data home, read the way the CLI reads it. One rig keeps the scenarios about behaviour,
 *   not plumbing.
 *
 *   A restart is the same data home served by a second server: pass the first rig's fixture
 *   and secrets store (the SecretStore holds the run secrets across it, d-0100) and the
 *   project, already in the database, is not registered again.
 *
 * Exports: E2eRig, E2eOptions, startE2eRig(), intakeBody().
 * Depends on: src/config, src/services/assemble, helpers/fixture-repo, helpers/fake-worker-driver,
 *   helpers/install-token, helpers/recording-secrets, helpers/scripted-llm.
 *   IO: git, SQLite, a loopback socket.
 */

import { loadSettings } from '#/config/load-settings.js';
import { KNOWN_GOOD_BUILDS } from '@forge/drivers';
import { createMemorySecretStore } from '@forge/secrets';
import { assembleServer } from '#/services/assemble.js';
import { bearer, readInstallToken } from '#tests/helpers/install-token.js';
import type { ForgeServer, ServerAddress } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';
import { createFixtureRepo, fixtureProjectBody } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { createFakeWorker } from '#tests/helpers/fake-worker-driver.js';
import type { Behaviour, FakeWorker } from '#tests/helpers/fake-worker-driver.js';
import { createRecordingSecrets } from '#tests/helpers/recording-secrets.js';
import type { RecordingSecrets } from '#tests/helpers/recording-secrets.js';
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
  /** The run secret store, remembering every secret ever written to it (it is emptied as runs end). */
  readonly secrets: RecordingSecrets;
  /** The install token the server created in the fixture's data home. */
  readonly token: string;
  /** `Authorization` header for requests made without `call`. */
  readonly authHeaders: Record<string, string>;
  /** JSON request to the server; returns the status and parsed body. */
  call(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: unknown }>;
  dispose(): Promise<void>;
}

/** Reuse a first rig's data home and secrets for a second server (a restart). */
export interface E2eOptions {
  readonly fixture?: FixtureRepo;
  readonly secrets?: RecordingSecrets;
  /**
   * `POST /projects` body that registers the project, for a `fixture` the caller made itself
   * (a folder with no git, a subfolder of a repository). Without it only a fixture the rig
   * made is registered, with `fixtureProjectBody`.
   */
  readonly register?: (fixture: FixtureRepo) => Record<string, unknown>;
  /** Saves `engine.shutdown_drain_ms` as a company setting before the first request (a restart keeps it). */
  readonly drainMs?: number;
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
export async function startE2eRig(
  behaviours: readonly Behaviour[],
  options: E2eOptions = {},
): Promise<E2eRig> {
  const ownsFixture = options.fixture === undefined;
  const fixture = options.fixture ?? createFixtureRepo();
  const secrets = options.secrets ?? createRecordingSecrets(createMemorySecretStore());
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
      shutdownGraceMs: 6_000,
    };

    server = await assembleServer(settings, {
      secrets,
      llm: director.llm,
      // The fake worker's harness is a build the release shipped as verified, so its native
      // tools are approved at start-up and nothing is checked (d-0088).
      compat: {
        engine: 'acp',
        installedVersion: async () => KNOWN_GOOD_BUILDS[0]?.version ?? null,
        check: async () => {
          throw new Error('the e2e rig never runs a real compatibility check');
        },
      },
      log: (level, message, fields) =>
        logs.push(`${level} ${message} ${fields ? JSON.stringify(fields) : ''}`),
      driver: (deps) => {
        worker = createFakeWorker(deps, () => server as ForgeServer, behaviours);

        return worker.driver;
      },
    });

    const address = await server.start();
    const live = server;
    const token = await readInstallToken(fixture.dataHome);
    const call: E2eRig['call'] = async (method, path, body, headers = {}) => {
      const res = await fetch(`${address.url}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...bearer(token), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const text = await res.text();

      return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
    };

    // The project is registered the way a user does it, never by touching the database.
    // A restarted server finds it already there.
    if (ownsFixture || options.register) {
      const registered = await call(
        'POST',
        '/projects',
        options.register ? options.register(fixture) : fixtureProjectBody(fixture),
      );

      if (registered.status !== 201) {
        throw new Error(
          `could not register the fixture project: ${JSON.stringify(registered.body)}`,
        );
      }
    }

    if (options.drainMs !== undefined) {
      const current = await call('GET', '/settings/company');
      const saved = await call('PUT', '/settings/company', {
        doc: { engine: { shutdown_drain_ms: options.drainMs } },
        expectedVersion: (current.body as { version: number }).version,
        author: 'e2e',
        reason: 'shorter drain',
      });

      if (saved.status !== 200) {
        throw new Error(`could not set the drain time: ${JSON.stringify(saved.body)}`);
      }
    }

    return {
      server: live,
      address,
      fixture,
      settings,
      worker: worker as FakeWorker,
      director,
      logs,
      secrets,
      token,
      authHeaders: bearer(token),
      call,
      async dispose() {
        await live.stop();
        if (ownsFixture) {
          fixture.dispose();
        }
      },
    };
  } catch (error) {
    await server?.stop();
    if (ownsFixture) {
      fixture.dispose();
    }

    throw error;
  }
}
