/**
 * Probe 10: a run survives a server restart on the real Claude harness (billable, gated).
 *
 * Why: the end-to-end test proves the resume path with a scripted Worker. Only the real thing
 *   shows whether Claude Code's ACP adapter can load the session of a run that was stopped by
 *   a graceful shutdown (`session/load` on the saved session, d-0035), whether the restored
 *   Worker runs our hook under its new token and port (SessionStart before its next tool
 *   call), and whether it carries on from the edits already in the worktree instead of
 *   starting over. It also shows the receipt chain really is verified across two secret
 *   generations by G1 (d-0100), on the real DPAPI-protected store.
 *
 * Pins: the first server is stopped (graceful) after the Worker's first tool call; the run is
 *   `interrupted` with a session and its secret still stored; a second server on the same data
 *   home resumes the SAME run (generation 2) and the ticket reaches `done` with a passed G1 whose
 *   report says it verified two generations; the chain has one `resumed` link and verifies with
 *   the recorded generation secrets; the resumed process registered hook liveness again; the
 *   change is in the bare repo's main; the secrets are deleted once the ticket is done. A run
 *   that finished before the stop (too quick to interrupt) fails the probe with that reason:
 *   run it again. A ticket that parks fails at once with the reason. Artefacts go to
 *   `.forge/data/probes/10/`.
 * Models: the production matrix (d-0060): Director steps on opus, Workers on sonnet.
 * Depends on: a prior `pnpm build` (the hook and MCP server run from `dist/`), a logged-in
 *   `claude`. IO: spawns the real adapter and `claude -p`, git, loopback sockets, DPAPI.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openSqlite } from '@forge/db';
import { createJsonLogger } from '@forge/engine';
import type { Logger } from '@forge/engine';
import { createDpapiSecretStore } from '@forge/secrets';
import { verifyGenerations } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { loadSettings } from '#/config/load-settings.js';
import { assembleServer } from '#/services/assemble.js';
import { createClaudePorts } from '#/services/claude-ports.js';
import {
  createFixtureRepo,
  fixtureProjectBody,
  git,
} from '#tests/helpers/fixture-repo.js';
import {
  STOPPED_STATUSES,
  collectDiagnosis,
  describeStop,
  writeArtefacts,
} from '#tests/helpers/probe-artefacts.js';
import type { Diagnosis } from '#tests/helpers/probe-artefacts.js';
import { PROBES_ENABLED, SKIP_REASON, probeDir } from '#tests/helpers/probe-env.js';
import { bearer, readInstallToken } from '#tests/helpers/install-token.js';
import { createRecordingSecrets } from '#tests/helpers/recording-secrets.js';
import type { ForgeServer } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';
import type { RecordingSecrets } from '#tests/helpers/recording-secrets.js';

const probe = it.skipIf(!PROBES_ENABLED);
const TEN_MINUTES = 10 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;
const FAST_POLL_MS = 100;
const POLL_MS = 2_000;
const TICKET = 'FX-1';

interface TicketView {
  ticket: { status: string };
  runs: { id: string; status: string; generation?: number }[];
  gate_results: { gate: string; status: string; report_ref?: string }[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One real server on `loaded`'s data home; the compatibility check is approved like probe 8 does. */
async function startServer(
  loaded: ServerSettings,
  secrets: RecordingSecrets,
  log: Logger,
): Promise<ForgeServer> {
  const server = await assembleServer(loaded, {
    ...createClaudePorts(loaded, log),
    secrets,
  });

  await server.start();
  await server.compat.idle();
  const captured = await server.compat.tools('claude');
  for (const t of captured.tools.filter((row) => row.status === 'pending')) {
    await server.compat.decide('claude', t.tool, 'approved', {
      author: 'probe10',
      reason: 'live probe approves the shapes the check captured',
    });
  }

  return server;
}

describe('probe 10: a run resumes after a server restart on the real Claude harness', () => {
  probe(
    `resumes the interrupted run and reaches done with a G1 over two generations ${SKIP_REASON}`,
    async () => {
      const out = probeDir('10');
      const lines: string[] = [];
      const fixture = createFixtureRepo();
      const loaded = await loadSettings(
        {
          ...process.env,
          FORGE_ROOT: fixture.root,
          FORGE_HOME: fixture.dataHome,
          FORGE_PORT: '0',
        },
        fixture.root,
      );

      const write = createJsonLogger((line) => lines.push(line), 'debug');
      // The real DPAPI store, wrapped to remember what was written: run secrets are deleted
      // when the run is over, and the probe verifies the chain afterwards.
      const secrets = createRecordingSecrets(
        createDpapiSecretStore({ dir: loaded.layout.data.secretsDir }),
      );

      const first = await startServer(loaded, secrets, write);
      let current = first;
      let diagnosis: Diagnosis | null = null;
      let passed = false;
      try {
        const token = await readInstallToken(fixture.dataHome);
        const call = async (
          server: ForgeServer,
          method: string,
          path: string,
          body?: unknown,
        ) => {
          const url = server.address()?.url ?? '';
          const res = await fetch(`${url}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...bearer(token) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });

          return { status: res.status, body: (await res.json()) as unknown };
        };

        const registered = await call(
          first,
          'POST',
          '/projects',
          fixtureProjectBody(fixture),
        );

        expect(registered.status).toBe(201);

        const intake = await call(first, 'POST', '/intake', {
          source: 'chat',
          kind: 'new_request',
          dedupe_key: 'probe10-1',
          actor: { type: 'user', id: 'probe' },
          project: 'fixture',
          payload: {
            text: 'Add a function add(a, b) to src/math.js and a test for it in test/math.test.js.',
          },
          received_at: new Date().toISOString(),
        });

        expect(intake.status).toBe(202);

        // Stop the first server right after the Worker's first tool call: a decision receipt
        // exists, so there is a chain segment to verify and an edit-in-progress to resume.
        const deadline = Date.now() + TEN_MINUTES;
        let runId = '';
        for (;;) {
          const status = (await call(first, 'GET', `/tickets/${TICKET}`))
            .body as TicketView;

          const state = status.ticket?.status;
          if (STOPPED_STATUSES.includes(state ?? '')) {
            diagnosis = await collectDiagnosis(first, TICKET);
            throw new Error(describeStop(diagnosis));
          }

          const run = status.runs?.at(-1);
          if (run && run.status !== 'running' && run.status !== 'starting') {
            throw new Error(
              `the run reached ${run.status} before the probe could stop the server; run the probe again`,
            );
          }

          if (run) {
            runId = run.id;
            const calls = (
              await first.storage.transaction((tx) => tx.runEvents.listByRun(run.id))
            ).filter((e) => e.type === 'tool_call');

            const decided = (await first.receipts.list(run.id)).some(
              (r) => r.kind === 'decision',
            );

            if (calls.length >= 1 && decided) {
              break;
            }
          }

          if (Date.now() > deadline) {
            throw new Error('timed out waiting for the Worker to make a tool call');
          }

          await sleep(FAST_POLL_MS);
        }

        await first.stop();
        // What shutdown left: the run interrupted with its session, its secret still stored.
        const db = openSqlite(loaded.layout.data.dbPath);
        try {
          const left = await db.storage.transaction((tx) => tx.runs.get(runId));
          expect(left?.status).toBe('interrupted');
          expect(left?.resumable_session).toBeTruthy();
          expect(await secrets.list('run/')).toContain(`run/${runId}/secret-g1`);
        } finally {
          await db.storage.close();
        }

        // The same data home, the same secret store, a new process and a new port.
        current = await startServer(loaded, secrets, write);

        const finish = Date.now() + FIFTEEN_MINUTES;
        for (;;) {
          const status = (await call(current, 'GET', `/tickets/${TICKET}`))
            .body as TicketView;

          const state = status.ticket?.status;
          if (state === 'done') {
            break;
          }

          if (STOPPED_STATUSES.includes(state ?? '')) {
            diagnosis = await collectDiagnosis(current, TICKET);
            throw new Error(describeStop(diagnosis));
          }

          if (Date.now() > finish) {
            throw new Error(
              `timed out waiting for the ticket to reach done (at ${state})`,
            );
          }

          await sleep(POLL_MS);
        }

        diagnosis = await collectDiagnosis(current, TICKET);
        const last = diagnosis.runs.at(-1);
        const receipts = last?.receipts ?? [];
        const events = last?.events ?? [];
        const g1 = diagnosis.gateResults.at(-1);

        expect(diagnosis.runs).toHaveLength(1);
        expect(last?.run).toMatchObject({ id: runId, status: 'success', generation: 2 });
        expect(g1).toMatchObject({ gate: 'G1', status: 'passed' });
        expect(git(fixture.remote, 'show', 'main:src/math.js')).toMatch(/add/);

        const report = readFileSync(
          join(loaded.layout.data.home, g1?.report_ref ?? ''),
          'utf8',
        );

        expect(report).toContain('across 2 generation(s)');
        expect(receipts.filter((r) => r.kind === 'resumed')).toHaveLength(1);
        expect(
          verifyGenerations(receipts, (g) => secrets.secretOf(runId, g)),
        ).toMatchObject({ ok: true, value: { generations: 2 } });

        expect(events.filter((e) => e.type === 'hook_liveness')).toHaveLength(2);
        expect(last?.run.hook_registered_at).toBeTruthy();

        const gone = Date.now() + 30_000;
        while ((await secrets.list('run/')).length > 0) {
          if (Date.now() > gone) {
            throw new Error('the run secrets were not deleted after the ticket was done');
          }

          await sleep(250);
        }

        passed = true;
      } finally {
        diagnosis ??= await collectDiagnosis(current, TICKET).catch(() => null);
        writeArtefacts(out, fixture.dataHome, diagnosis, lines.join(''));
        await current.stop().catch(() => undefined);
        if (passed) {
          fixture.dispose();
        } else {
          // The temp repo holds the worktree, hook files and bare remote the failure needs.
          process.stderr.write(
            `probe 10 failed: fixture kept at ${fixture.root} (remote ${fixture.remote}); artefacts in ${out}\n`,
          );
        }
      }
    },
    FIFTEEN_MINUTES + TEN_MINUTES + 120_000,
  );
});
