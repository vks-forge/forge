/**
 * `installFakeForge()`: the whole stubbed Forge server for a screen test, in one call.
 *
 * Why: nearly every screen test wants the same thing: a Forge server that has sample projects,
 *   settings, memory and tickets, behaves like the real one when written to, and can be told
 *   to be empty or unreachable. This builds the route table from the per-area route modules,
 *   installs it as `fetch` with a scripted `EventSource` for run streams, and hands back the
 *   real http adapter pointed at the same stub, so a test can play a second writer (save a
 *   version behind the page's back) through the same API the screens use.
 *
 * Exports: installFakeForge(), FakeForge, Scenario.
 * Depends on: helpers/fetch-stub, helpers/event-source-stub, helpers/fake-forge/*-routes (agents, pipelines and history included),
 *   helpers/forge-data, api/http/http-adapter.
 */

import type { ConfigVersion } from '@forge/core';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import type { ForgeApi } from '#/types/api.types.js';
import { stubEventSource } from '#tests/helpers/event-source-stub.js';
import type { EventSourceStub } from '#tests/helpers/event-source-stub.js';
import { agentRoutes } from '#tests/helpers/fake-forge/agent-routes.js';
import { directorRoutes } from '#tests/helpers/fake-forge/director-routes.js';
import { cardRoutes } from '#tests/helpers/fake-forge/card-routes.js';
import { historyRoutes } from '#tests/helpers/fake-forge/history-routes.js';
import { overviewRoutes } from '#tests/helpers/fake-forge/overview-routes.js';
import { pipelineRoutes } from '#tests/helpers/fake-forge/pipeline-routes.js';
import { memoryRoutes } from '#tests/helpers/fake-forge/memory-routes.js';
import { projectRoutes } from '#tests/helpers/fake-forge/project-routes.js';
import { settingsRoutes } from '#tests/helpers/fake-forge/settings-routes.js';
import { ticketRoutes } from '#tests/helpers/fake-forge/ticket-routes.js';
import { networkDown, stubFetch } from '#tests/helpers/fetch-stub.js';
import type { FetchStub, Routes } from '#tests/helpers/fetch-stub.js';
import { historyFixtures } from '#tests/helpers/forge-data/settings-data.js';
import { streamScripts } from '#tests/helpers/forge-data/run-scripts.js';

/** `ok`: sample data; `empty`: lists with nothing in them; `error`: Forge is unreachable. */
export type Scenario = 'ok' | 'empty' | 'error';

export interface FakeForge {
  readonly stub: FetchStub;
  readonly streams: EventSourceStub;
  /** The app's own http adapter over the stub: use it to act as a second writer. */
  readonly api: ForgeApi;
}

export function installFakeForge(
  options: {
    scenario?: Scenario;
    /** The company's saved settings versions; default is the Limits and General sample. */
    companyHistory?: readonly ConfigVersion[];
    /** Extra routes that win over the sample ones, to stage a refusal or a dead call. */
    routes?: Routes;
  } = {},
): FakeForge {
  const scenario = options.scenario ?? 'ok';
  const empty = scenario === 'empty';
  const companyHistory = options.companyHistory ?? historyFixtures();
  const all: Routes = {
    ...settingsRoutes({ empty, companyHistory }),
    ...projectRoutes({ empty, companyHistory }),
    ...memoryRoutes({ empty }),
    ...ticketRoutes({ empty }),
    ...cardRoutes({ empty }),
    ...historyRoutes({ empty }),
    ...overviewRoutes(),
    ...agentRoutes(),
    ...pipelineRoutes(),
    ...directorRoutes(),
  };

  const routes: Routes =
    scenario === 'error'
      ? Object.fromEntries(Object.keys(all).map((key) => [key, networkDown]))
      : all;

  const stub = stubFetch(routes);
  if (options.routes) {
    stub.use(options.routes);
  }

  const streams = stubEventSource(streamScripts());

  return { stub, streams, api: createHttpAdapter({ baseUrl: '/api' }) };
}
