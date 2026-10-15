/**
 * The `mock` side of the settings resources: a small stateful stand-in for the server.
 *
 * Why: settings screens are about writes (save a version, store a key, approve a tool), and a
 *   write flow cannot be tested against a fixed list. This keeps its own state so a saved
 *   version appears in history, a second save from a stale editor gets the same 409 the real
 *   server gives, a stored key flips "key stored" without ever being readable, and a
 *   compatibility check shows "running" before it finishes. State lives per adapter instance,
 *   so each test starts clean. Never used in a release (d-0118).
 *
 * Exports: createSettingsMock().
 * Depends on: @forge/core, api/api-error, api/mock/settings-fixtures, schemas/settings,
 *   types/api.types.
 */

import { BUILTIN_FORGE_CONFIG, ConfigAppend, mergeCompany } from '@forge/core';
import type { ConfigVersion, GithubConnection, HarnessToolSchema } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import {
  connectionFixtures,
  harnessFixture,
  historyFixtures,
  reportFixture,
  toolFixtures,
} from '#/api/mock/settings-fixtures.js';
import type { CompatJob, HarnessView } from '#/schemas/settings.js';
import type { MockScenario, ResourceApis } from '#/types/api.types.js';

const notFound = (what: string): ApiError =>
  new ApiError('http', `No ${what}.`, { status: 404, code: 'not_found' });

/** The compatibility check shows as running for this many reads after it starts. */
const RUNNING_READS = 2;

export function createSettingsMock(
  delay: (signal: AbortSignal | undefined) => Promise<void>,
  scenario: MockScenario,
): Pick<ResourceApis, 'harnesses' | 'github' | 'settings'> {
  const empty = scenario === 'empty';
  const harnesses = new Map<string, HarnessView>(
    empty ? [] : [['claude', harnessFixture()]],
  );

  const tools = new Map<string, HarnessToolSchema[]>([['claude', toolFixtures()]]);
  const jobs = new Map<string, { reads: number; state: CompatJob['state'] }>();
  const connections: GithubConnection[] = empty ? [] : connectionFixtures();
  const history: ConfigVersion[] = empty ? [] : historyFixtures();

  const gate = async (signal?: AbortSignal): Promise<void> => {
    await delay(signal);
    if (scenario === 'error') {
      throw new ApiError('network', 'Cannot reach the Forge server (simulated).');
    }
  };

  const harness = (id: string): HarnessView => {
    const row = harnesses.get(id);
    if (!row) {
      throw notFound(`harness ${id}`);
    }

    return row;
  };

  const currentVersion = (): number => history.at(-1)?.version ?? 0;
  const currentDoc = (): Record<string, unknown> => {
    const last = history.at(-1);

    return last ? (last.doc as Record<string, unknown>) : {};
  };

  return {
    harnesses: {
      async list(request) {
        await gate(request?.signal);

        return { harnesses: [...harnesses.values()], paused: [] };
      },
      async save(id, body) {
        await gate();
        const before = harnesses.get(id);
        const row: HarnessView = {
          id,
          kind: body.kind,
          ...(body.binary_path === undefined ? {} : { binary_path: body.binary_path }),
          auth_mode: body.auth_mode,
          status: 'unknown',
          secrets: before?.secrets ?? { api_key: false, oauth_token: false },
        };

        harnesses.set(id, row);

        return row;
      },
      async putSecret(id, body) {
        await gate();
        const row = harness(id);
        // The value is dropped on purpose: the real server never returns it either.
        harnesses.set(id, {
          ...row,
          status: 'unknown',
          secrets: { ...row.secrets, [body.kind]: true },
        });

        return { id, kind: body.kind, stored: true };
      },
      async test(id, live) {
        await gate();
        const row = harness(id);
        const missing =
          row.auth_mode !== 'login' && !row.secrets[row.auth_mode]
            ? `No ${row.auth_mode === 'api_key' ? 'API key' : 'OAuth token'} is stored for this harness.`
            : undefined;

        harnesses.set(id, {
          ...row,
          status: missing ? 'error' : 'ok',
          version: row.version ?? '2.1.142',
          last_checked_at: new Date().toISOString(),
        });

        return {
          ok: missing === undefined,
          auth_mode: row.auth_mode,
          version: row.version ?? '2.1.142',
          account_kind: row.auth_mode === 'login' ? 'account' : row.auth_mode,
          live: live && !missing ? 'ok' : 'skipped',
          ...(missing ? { error: missing } : {}),
          ...(live
            ? {}
            : { live_note: 'live probe skipped; add ?live=1 to make one paid call' }),
        };
      },
      async compat(id, request) {
        await gate(request?.signal);
        const row = harness(id);
        const job = jobs.get(id);
        if (job?.state === 'running') {
          job.reads += 1;
          if (job.reads > RUNNING_READS) {
            job.state = 'done';
          }
        }

        const state = job?.state ?? 'idle';
        const version = row.version ?? null;

        return {
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
        };
      },
      async runCompat(id) {
        await gate();
        const row = harness(id);
        jobs.set(id, { reads: 0, state: 'running' });

        return {
          state: 'running',
          ...(row.version === undefined ? {} : { version: row.version }),
          started_at: new Date().toISOString(),
        };
      },
      async tools(id, request) {
        await gate(request?.signal);
        harness(id);

        return {
          version: harness(id).version ?? null,
          tools: [...(tools.get(id) ?? [])],
        };
      },
      async decideTool(id, tool, decision, body) {
        await gate();
        const rows = tools.get(id) ?? [];
        const at = rows.findIndex((t) => t.tool === tool);
        const current = rows[at];
        if (!current) {
          throw notFound(`schema for tool ${tool}`);
        }

        const next: HarnessToolSchema = {
          ...current,
          status: decision === 'approve' ? 'approved' : 'denied',
          decided_by: body.author,
          decided_at: new Date().toISOString(),
          decision_reason: body.reason,
        };

        rows[at] = next;

        return next;
      },
    },
    github: {
      async list(request) {
        await gate(request?.signal);

        return [...connections];
      },
      async add(body) {
        await gate();
        const base = body.account.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        let id = base;
        for (let n = 2; connections.some((c) => c.id === id); n += 1) {
          id = `${base}-${n}`;
        }

        const row: GithubConnection = {
          id,
          account: body.account,
          app_id: body.app_id,
          ...(body.app_slug ? { app_slug: body.app_slug } : {}),
          key_secret_name: `github/${id}/key`,
          status: 'active',
          created_at: new Date().toISOString(),
        };

        connections.push(row);

        return row;
      },
    },
    settings: {
      async company(request) {
        await gate(request?.signal);
        const config = mergeCompany(BUILTIN_FORGE_CONFIG, currentDoc());

        return { config, version: currentVersion() };
      },
      async companyHistory(request) {
        await gate(request?.signal);

        return structuredClone(history);
      },
      async saveCompany(body) {
        await gate();
        const request = ConfigAppend.safeParse({ scope: 'company', ...body });
        if (!request.success) {
          const where = request.error.issues[0]?.path.join('.') ?? 'doc';

          throw new ApiError('http', `The settings are not valid (${where}).`, {
            status: 400,
            code: 'invalid_input',
          });
        }

        if (body.expectedVersion !== currentVersion()) {
          throw new ApiError(
            'http',
            `Settings are at version ${currentVersion()}, not ${body.expectedVersion}.`,
            { status: 409, code: 'version_conflict' },
          );
        }

        const saved = {
          id: history.length + 1,
          scope: 'company',
          project: null,
          version: currentVersion() + 1,
          doc: structuredClone(body.doc),
          author: body.author,
          reason: body.reason,
          created_at: Date.now(),
        } as ConfigVersion;

        history.push(saved);

        return structuredClone(saved);
      },
    },
  };
}
