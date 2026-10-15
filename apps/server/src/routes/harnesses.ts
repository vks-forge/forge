/**
 * `/harnesses/*`: register the installed coding harness, choose how it signs in, test it.
 *
 * Why: Workers and the Director run the `claude` the user installed (d-0087). The owner has
 *   to say where it is (or leave it to PATH), pick the login, an API key or an OAuth token,
 *   paste the credential and check the whole thing works before a ticket depends on it.
 *   The credential goes straight into the SecretStore and is never returned: the list only
 *   says whether one is stored. A save resets the last test result, because it no longer
 *   describes the new settings. The test costs nothing unless `?live=1` is given, which makes
 *   one real one-word model call. The `claude setup-token` sign-in flow (a terminal session
 *   driven from the UI) is not here yet; for now the owner pastes a token minted elsewhere.
 *
 * Exports: harnessRoutes().
 * Depends on: @forge/core (Harness, HarnessId, harnessSecretName), schemas/api,
 *   services/http/{body,http-errors,respond}, types/routes. IO: storage and SecretStore
 *   access, and whatever the injected tester runs.
 */

import { Harness, HarnessId, harnessSecretName } from '@forge/core';
import type { HarnessSetup } from '@forge/drivers';
import {
  HarnessPutBody,
  HarnessSecretBody,
  LiveQuery,
  ToolDecisionBody,
} from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { DEFAULT_HARNESS } from '#/services/harness-source.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

function idOf(ctx: RouteContext): string {
  const parsed = HarnessId.safeParse(ctx.params['id'] ?? '');
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_harness_id', 'harness id must be a lowercase slug');
  }

  return parsed.data;
}

async function requireHarness(deps: RouteDeps, id: string): Promise<Harness> {
  const row = await deps.storage.transaction((tx) => tx.harnesses.get(id));
  if (!row) {
    throw new HttpError(404, 'harness_not_found', `no harness ${id}`);
  }

  return row;
}

/** The harness named in the path for the compat and tool routes: the default one counts even before it is registered (it runs on the defaults). */
async function knownHarnessId(deps: RouteDeps, ctx: RouteContext): Promise<string> {
  const id = idOf(ctx);
  if (id !== DEFAULT_HARNESS) {
    await requireHarness(deps, id);
  }

  return id;
}

/** Row plus whether a credential of each kind is stored; never the credential. */
async function describe(deps: RouteDeps, row: Harness) {
  const names = new Set(await deps.secrets.list(`harness/${row.id}/`));

  return {
    ...row,
    secrets: {
      api_key: names.has(harnessSecretName(row.id, 'api_key')),
      oauth_token: names.has(harnessSecretName(row.id, 'oauth_token')),
    },
  };
}

/** A paused harness stays paused through an edit: only a passing check lifts it. */
const pausedOf = (row: Harness | null) =>
  row?.status === 'paused'
    ? {
        status: 'paused' as const,
        ...(row.status_note === undefined ? {} : { status_note: row.status_note }),
      }
    : { status: 'unknown' as const };

const currentRow = (deps: RouteDeps, id: string): Promise<Harness | null> =>
  deps.storage.transaction((tx) => tx.harnesses.get(id));

const setupOf = (row: Harness): HarnessSetup => ({
  id: row.id,
  binaryPath: row.binary_path,
  authMode: row.auth_mode,
});

/** Approves or denies the stored schema of one tool of the installed build. */
async function decide(
  deps: RouteDeps,
  ctx: RouteContext,
  decision: 'approved' | 'denied',
): Promise<void> {
  const id = await knownHarnessId(deps, ctx);
  const body = await readJson(ctx.req, ToolDecisionBody);
  const tool = ctx.params['tool'] ?? '';
  const saved = await deps.compat.decide(id, tool, decision, body);
  if (!saved) {
    throw new HttpError(
      404,
      'tool_not_found',
      `no schema for tool ${tool} of the installed build of ${id}`,
    );
  }

  sendJson(ctx.res, 200, saved);
}

export function harnessRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/harnesses',
      async handle({ res }) {
        const rows = await deps.storage.transaction((tx) => tx.harnesses.list());
        sendJson(res, 200, {
          harnesses: await Promise.all(rows.map((row) => describe(deps, row))),
        });
      },
    },
    {
      method: 'PUT',
      path: '/harnesses/:id',
      async handle(ctx) {
        const id = idOf(ctx);
        const body = await readJson(ctx.req, HarnessPutBody);
        const row = Harness.parse({
          id,
          kind: body.kind,
          ...(body.binary_path === undefined ? {} : { binary_path: body.binary_path }),
          auth_mode: body.auth_mode,
          ...pausedOf(await currentRow(deps, id)),
        });

        await deps.storage.transaction((tx) => tx.harnesses.upsert(row));
        sendJson(ctx.res, 200, await describe(deps, row));
      },
    },
    {
      method: 'PUT',
      path: '/harnesses/:id/secret',
      async handle(ctx) {
        const id = idOf(ctx);
        const body = await readJson(ctx.req, HarnessSecretBody);
        const row = await requireHarness(deps, id);

        await deps.secrets.put(
          harnessSecretName(id, body.kind),
          new TextEncoder().encode(body.value),
        );

        // The value is not echoed, and the last test no longer describes this credential.
        await deps.storage.transaction((tx) =>
          tx.harnesses.upsert(
            Harness.parse({
              id: row.id,
              kind: row.kind,
              ...(row.binary_path === undefined ? {} : { binary_path: row.binary_path }),
              auth_mode: row.auth_mode,
              ...pausedOf(row),
            }),
          ),
        );

        sendJson(ctx.res, 200, { id, kind: body.kind, stored: true });
      },
    },
    {
      method: 'POST',
      path: '/harnesses/:id/test',
      async handle(ctx) {
        const row = await requireHarness(deps, idOf(ctx));
        const live = LiveQuery.safeParse(ctx.url.searchParams.get('live')).success;
        const result = await deps.harnessTest(setupOf(row), live);

        await deps.storage.transaction((tx) =>
          tx.harnesses.upsert(
            Harness.parse({
              ...row,
              ...(result.version === undefined ? {} : { version: result.version }),
              status: row.status === 'paused' ? 'paused' : result.ok ? 'ok' : 'error',
              last_checked_at: new Date(deps.now()).toISOString(),
            }),
          ),
        );

        // A build seen for the first time is checked (or recorded as verified) from here too.
        if (result.ok) {
          await deps.compat.observe(row.id);
        }

        sendJson(ctx.res, 200, {
          ...result,
          ...(live
            ? {}
            : { live_note: 'live probe skipped; add ?live=1 to make one paid call' }),
        });
      },
    },
    {
      method: 'GET',
      path: '/harnesses/:id/compat',
      async handle(ctx) {
        const id = await knownHarnessId(deps, ctx);
        sendJson(ctx.res, 200, await deps.compat.view(id));
      },
    },
    {
      method: 'POST',
      path: '/harnesses/:id/compat/run',
      async handle(ctx) {
        const id = await knownHarnessId(deps, ctx);
        // Reads the installed build first so the check is about what is installed now.
        await deps.compat.observe(id);
        sendJson(ctx.res, 202, await deps.compat.start(id));
      },
    },
    {
      method: 'GET',
      path: '/harnesses/:id/tools',
      async handle(ctx) {
        const id = await knownHarnessId(deps, ctx);
        sendJson(ctx.res, 200, await deps.compat.tools(id));
      },
    },
    {
      method: 'POST',
      path: '/harnesses/:id/tools/:tool/approve',
      handle: (ctx) => decide(deps, ctx, 'approved'),
    },
    {
      method: 'POST',
      path: '/harnesses/:id/tools/:tool/deny',
      handle: (ctx) => decide(deps, ctx, 'denied'),
    },
  ];
}
