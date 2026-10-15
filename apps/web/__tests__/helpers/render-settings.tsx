/**
 * `renderSettings()`: mounts the real app on a Forge settings URL over the stubbed server and
 * hands back the API.
 *
 * Why: settings tests are about writes (a save, a conflict, a stored key), and a conflict can
 *   only be staged by a second writer. Returning the app's own http adapter, pointed at the
 *   same stub the screens use, lets a test play that second writer (save a version behind the
 *   page's back) and then assert what the page does. Everything else is the shipped
 *   providers, route table and adapter.
 *
 * Exports: renderSettings().
 * Depends on: helpers/render-app.
 */

import type { createMemoryRouter } from 'react-router';
import type { ForgeApi } from '#/types/api.types.js';
import type { Scenario } from '#tests/helpers/fake-forge/fake-forge.js';
import { renderApp } from '#tests/helpers/render-app.js';
import type { FakeForge } from '#tests/helpers/fake-forge/fake-forge.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';

export function renderSettings(
  path: string,
  options: { scenario?: Scenario; routes?: Routes } = {},
): { api: ForgeApi; router: ReturnType<typeof createMemoryRouter>; forge: FakeForge } {
  const { forge, router } = renderApp({ path, ...options });

  return { api: forge.api, router, forge };
}
