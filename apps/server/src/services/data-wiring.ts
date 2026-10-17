/**
 * Composes the data ports the rest of the server is built on: secrets, the debug trace, tracked storage and config.
 *
 * Why: the assembly must stay a short list of wiring steps, and the order here matters. Secrets
 *   come first because the trace redacts their values. The trace comes next (off by default,
 *   `FORGE_TRACE`, d-0163): with it off the trace is the no-op sink and storage and config are the
 *   very objects that went in, so no decorator is installed and no folder is created; with it on,
 *   every committed write and every settings save is recorded. Storage then gets the live-query
 *   wrapper (no writer can forget to tell the project streams, d-0132), and config is limited to
 *   registered projects (an unknown slug is not given defaults).
 *
 * Exports: composeData().
 * Depends on: @forge/core, @forge/secrets, services/{lazy-secrets,known-project-config,
 *   project-events,tracked-storage,trace-storage}, services/trace/{create-trace,trace-config}, types/{server,settings}.
 *   IO: through create-trace (the trace folder, the install token file).
 */

import type { Clock, ConfigSource, StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createDpapiSecretStore } from '@forge/secrets';
import { withKnownProjects } from '#/services/known-project-config.js';
import { createLazySecretStore } from '#/services/lazy-secrets.js';
import { createProjectEvents } from '#/services/project-events.js';
import { createTrace } from '#/services/trace/create-trace.js';
import { traceConfigWrites } from '#/services/trace/trace-config.js';
import { traceStorageWrites } from '#/services/trace-storage.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';
import type { DataPorts } from '#/types/data-wiring.types.js';
import type { ExternalPorts } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

export function composeData(opts: {
  readonly settings: ServerSettings;
  readonly ports: ExternalPorts;
  readonly storage: StorageAdapter;
  readonly config: ConfigSource;
  readonly clock: Clock;
  readonly log: Logger;
}): DataPorts {
  const { settings, ports, clock, log } = opts;
  const { data } = settings.layout;
  // The DPAPI store is created on first use (run secrets, d-0100): a server with no GitHub
  // project and no run, or off Windows, never opens it.
  const secrets =
    ports.secrets ??
    createLazySecretStore(() => createDpapiSecretStore({ dir: data.secretsDir }));

  const trace = createTrace({
    settings: settings.trace,
    storage: opts.storage,
    secrets,
    installTokenPath: data.installTokenPath,
    env: settings.env,
    passthrough: settings.harnessEnvPassthrough,
    clock,
    stderr: (text) => process.stderr.write(text),
    log,
  });

  const projectEvents = createProjectEvents();
  const storage = trackProjectWrites(
    trace.enabled ? traceStorageWrites(opts.storage, trace.sink) : opts.storage,
    projectEvents,
  );

  const config = withKnownProjects(
    trace.enabled ? traceConfigWrites(opts.config, trace.sink) : opts.config,
    storage,
  );

  return { secrets, trace, projectEvents, storage, config };
}
