/**
 * Stub routes for Forge settings: harnesses, GitHub connections and the company settings.
 *
 * Why: settings screens are about writes (save a version, store a key, approve a tool), and a
 *   write flow cannot be tested against a fixed answer. These routes keep their own state, so
 *   a saved version appears in the history, a second save from a stale editor gets the same
 *   409 the real server gives, a stored key flips "key stored" without ever being readable,
 *   and a compatibility check shows "running" for a couple of reads before it finishes. The
 *   shapes match the server's JSON, so the real http adapter and its schemas parse them.
 *   State lives per call of `settingsRoutes()`, so each test starts clean.
 *
 * Exports: settingsRoutes().
 * Depends on: @forge/core, helpers/fetch-stub, helpers/forge-data/director-data,
 *   helpers/forge-data/settings-data,
 *   schemas/settings (types).
 */

import { ConfigAppend, mergeCompany } from '@forge/core';
import type { ConfigVersion, GithubConnection, HarnessToolSchema } from '@forge/core';
import { BUILTIN_FORGE_WITH_DIRECTOR } from '#tests/helpers/forge-data/director-data.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import {
  connectionFixtures,
  harnessFixture,
  historyFixtures,
  reportFixture,
  toolFixtures,
} from '#tests/helpers/forge-data/settings-data.js';
import { setupCacheRoutes } from '#tests/helpers/fake-forge/setup-cache-routes.js';
import type { CompatJob, HarnessView } from '#/schemas/settings.js';

/** The compatibility check shows as running for this many reads after it starts. */
const RUNNING_READS = 2;

const notFound = (what: string) => refusal(404, 'not_found', `No ${what}.`);

export function settingsRoutes(options: {
  empty: boolean;
  companyHistory?: readonly ConfigVersion[];
}): Routes {
  const { empty } = options;
  const harnesses = new Map<string, HarnessView>(
    empty ? [] : [['claude', harnessFixture()]],
  );

  const tools = new Map<string, HarnessToolSchema[]>([['claude', toolFixtures()]]);
  const jobs = new Map<string, { reads: number; state: CompatJob['state'] }>();
  const connections: GithubConnection[] = empty ? [] : connectionFixtures();
  const history: ConfigVersion[] = empty
    ? []
    : structuredClone([...(options.companyHistory ?? historyFixtures())]);

  const currentVersion = (): number => history.at(-1)?.version ?? 0;
  const currentDoc = (): Record<string, unknown> =>
    (history.at(-1)?.doc ?? {}) as Record<string, unknown>;

  return {
    ...setupCacheRoutes(),

    'GET /harnesses': () => json({ harnesses: [...harnesses.values()], paused: [] }),

    'PUT /harnesses/:id': ({ params, body }) => {
      const input = body as {
        kind: HarnessView['kind'];
        binary_path?: string;
        auth_mode: HarnessView['auth_mode'];
        bypass_permissions?: boolean;
      };

      const before = harnesses.get(params['id']!);
      const row: HarnessView = {
        id: params['id']!,
        kind: input.kind,
        ...(input.binary_path === undefined ? {} : { binary_path: input.binary_path }),
        auth_mode: input.auth_mode,
        status: 'unknown',
        bypass_permissions: input.bypass_permissions ?? before?.bypass_permissions,
        bypass_permissions_effective:
          input.bypass_permissions ?? before?.bypass_permissions ?? true,
        secrets: before?.secrets ?? { api_key: false, oauth_token: false },
      };

      harnesses.set(row.id, row);

      return json(row);
    },

    'PUT /harnesses/:id/secret': ({ params, body }) => {
      const row = harnesses.get(params['id']!);
      if (!row) {
        return notFound(`harness ${params['id']}`);
      }

      const { kind } = body as { kind: 'api_key' | 'oauth_token' };
      // The value is dropped on purpose: the real server never returns it either.
      harnesses.set(row.id, {
        ...row,
        status: 'unknown',
        secrets: { ...row.secrets, [kind]: true },
      });

      return json({ id: row.id, kind, stored: true });
    },

    'POST /harnesses/:id/test': ({ params, query }) => {
      const row = harnesses.get(params['id']!);
      if (!row) {
        return notFound(`harness ${params['id']}`);
      }

      const live = query.get('live') === '1';
      const missing =
        row.auth_mode !== 'login' && !row.secrets[row.auth_mode]
          ? `No ${row.auth_mode === 'api_key' ? 'API key' : 'OAuth token'} is stored for this harness.`
          : undefined;

      harnesses.set(row.id, {
        ...row,
        status: missing ? 'error' : 'ok',
        version: row.version ?? '2.1.142',
        last_checked_at: new Date().toISOString(),
      });

      return json({
        ok: missing === undefined,
        auth_mode: row.auth_mode,
        version: row.version ?? '2.1.142',
        account_kind: row.auth_mode === 'login' ? 'account' : row.auth_mode,
        live: live && !missing ? 'ok' : 'skipped',
        ...(missing ? { error: missing } : {}),
        ...(live
          ? {}
          : { live_note: 'live probe skipped; add ?live=1 to make one paid call' }),
      });
    },

    'GET /harnesses/:id/compat': ({ params }) => {
      const row = harnesses.get(params['id']!);
      if (!row) {
        return notFound(`harness ${params['id']}`);
      }

      const job = jobs.get(row.id);
      if (job?.state === 'running') {
        job.reads += 1;
        if (job.reads > RUNNING_READS) {
          job.state = 'done';
        }
      }

      const state = job?.state ?? 'idle';
      const version = row.version ?? null;

      return json({
        version,
        compat: state === 'running' ? 'pending' : 'pass',
        report: version === null || state === 'running' ? null : reportFixture(version),
        checked_at: row.last_checked_at ?? null,
        job: {
          state,
          ...(version === null ? {} : { version }),
          ...(state === 'running' ? { started_at: new Date().toISOString() } : {}),
          ...(state === 'done' && version !== null
            ? { report: reportFixture(version) }
            : {}),
        },
      });
    },

    'POST /harnesses/:id/compat/run': ({ params }) => {
      const row = harnesses.get(params['id']!);
      if (!row) {
        return notFound(`harness ${params['id']}`);
      }

      jobs.set(row.id, { reads: 0, state: 'running' });

      return json({
        state: 'running',
        ...(row.version === undefined ? {} : { version: row.version }),
        started_at: new Date().toISOString(),
      });
    },

    'GET /harnesses/:id/tools': ({ params }) => {
      const row = harnesses.get(params['id']!);
      if (!row) {
        return notFound(`harness ${params['id']}`);
      }

      return json({
        version: row.version ?? null,
        tools: [...(tools.get(row.id) ?? [])],
      });
    },

    'POST /harnesses/:id/tools/:tool/:decision': ({ params, body }) => {
      const rows = tools.get(params['id']!) ?? [];
      const at = rows.findIndex((t) => t.tool === params['tool']);
      const current = rows[at];
      if (!current) {
        return notFound(`schema for tool ${params['tool']}`);
      }

      const input = body as { author: string; reason: string };
      const next: HarnessToolSchema = {
        ...current,
        status: params['decision'] === 'approve' ? 'approved' : 'denied',
        decided_by: input.author,
        decided_at: new Date().toISOString(),
        decision_reason: input.reason,
      };

      rows[at] = next;

      return json(next);
    },

    'GET /github/connections': () => json({ connections: [...connections] }),

    'POST /github/connections': ({ body }) => {
      const input = body as {
        account: string;
        app_id: string;
        app_slug?: string;
      };

      const base = input.account.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let id = base;
      for (let n = 2; connections.some((c) => c.id === id); n += 1) {
        id = `${base}-${n}`;
      }

      const row: GithubConnection = {
        id,
        account: input.account,
        app_id: input.app_id,
        ...(input.app_slug ? { app_slug: input.app_slug } : {}),
        key_secret_name: `github/${id}/key`,
        status: 'active',
        created_at: new Date().toISOString(),
      };

      connections.push(row);

      return { status: 201, body: { connection: row } };
    },

    'GET /settings/company': () =>
      json({
        config: mergeCompany(BUILTIN_FORGE_WITH_DIRECTOR, currentDoc()),
        version: currentVersion(),
      }),

    'GET /settings/company/history': () => json({ versions: structuredClone(history) }),

    'PUT /settings/company': ({ body }) => {
      const input = body as {
        doc: Record<string, unknown>;
        author: string;
        reason: string;
        expectedVersion: number;
      };

      const request = ConfigAppend.safeParse({ scope: 'company', ...input });
      if (!request.success) {
        const where = request.error.issues[0]?.path.join('.') ?? 'doc';

        return refusal(400, 'invalid_input', `The settings are not valid (${where}).`);
      }

      if (input.expectedVersion !== currentVersion()) {
        return refusal(
          409,
          'version_conflict',
          `Settings are at version ${currentVersion()}, not ${input.expectedVersion}.`,
        );
      }

      const saved = {
        id: history.length + 1,
        scope: 'company',
        project: null,
        version: currentVersion() + 1,
        doc: structuredClone(input.doc),
        author: input.author,
        reason: input.reason,
        created_at: Date.now(),
      } as ConfigVersion;

      history.push(saved);

      return json(structuredClone(saved));
    },
  };
}
