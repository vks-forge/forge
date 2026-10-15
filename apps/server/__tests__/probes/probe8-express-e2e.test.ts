/**
 * Probe 8: an Express ticket end to end on the real Claude harness (billable, gated).
 *
 * Why: the in-process end-to-end test proves the pieces fit with a scripted Worker. Only the
 *   real thing shows whether they fit Claude Code: that the ACP adapter runs our hook (so
 *   `SessionStart` registers liveness and every tool call gets a chained receipt), that the
 *   per-run MCP server starts from `apps/mcp/dist` with the run's token, that a real Worker
 *   follows the finish contract so G1 passes on its claims, and that the Director's
 *   triage and prompt steps work on the real `claude -p`. Slice 2 exits on this.
 *
 * Pins: the ticket "add add(a, b) and a test" reaches `done` within 15 minutes; the change is in
 *   the bare repo's main; G1 passed; every tool call has a decision receipt and the chain
 *   verifies; a `hook_liveness` event exists. A ticket that parks (`waiting_human`,
 *   `blocked`, `cancelled`) fails the probe at once with the reason, the runs' errors, the
 *   last events and the denied decisions. Artefacts (ticket, runs, events, receipts, gate
 *   results and reports, interactions, server log) are written to `.forge/data/probes/8/`
 *   pass or fail; the fixture directory is kept on failure and its path printed.
 * Models: the production matrix (d-0060): Director steps on opus, Workers on sonnet.
 * Depends on: a prior `pnpm build` (the hook and MCP server run from `dist/`), a logged-in
 *   `claude`. IO: spawns the real adapter and `claude -p`, git, a loopback socket.
 */

import { createJsonLogger } from '@forge/engine';
import { verifyChain } from '@forge/tools';
import type { DecisionReceipt } from '@forge/tools';
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

const probe = it.skipIf(!PROBES_ENABLED);
const FIFTEEN_MINUTES = 15 * 60_000;
const POLL_MS = 2_000;
const TICKET = 'FX-1';

interface TicketView {
  ticket: { status: string };
}

describe('probe 8: Express ticket end to end on the real Claude harness', () => {
  probe(
    `reaches done with chained receipts and a passed G1 ${SKIP_REASON}`,
    async () => {
      const out = probeDir('8');
      const log: string[] = [];
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

      const write = createJsonLogger((line) => log.push(line), 'debug');
      const server = await assembleServer(loaded, createClaudePorts(loaded, write));
      const address = await server.start();

      // First sight of an installed build (Claude Code updates itself): the compatibility
      // check runs in the background and its native tools wait for the owner. The probe
      // approves what the check captured through the same service the API uses.
      await server.compat.idle();
      const captured = await server.compat.tools('claude');
      for (const t of captured.tools.filter((row) => row.status === 'pending')) {
        await server.compat.decide('claude', t.tool, 'approved', {
          author: 'probe8',
          reason: 'live probe approves the shapes the check captured',
        });
      }

      expect((await server.compat.view('claude')).compat).not.toBe('fail');
      // The install token the server created in the data home, as the CLI reads it.
      const token = await readInstallToken(fixture.dataHome);
      const call = async (method: string, path: string, body?: unknown) => {
        const res = await fetch(`${address.url}${path}`, {
          method,
          headers: { 'content-type': 'application/json', ...bearer(token) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });

        return { status: res.status, body: (await res.json()) as unknown };
      };

      let diagnosis: Diagnosis | null = null;
      let passed = false;
      try {
        // Registered through the API like a user would, into the data home's database.
        const registered = await call('POST', '/projects', fixtureProjectBody(fixture));
        expect(registered.status).toBe(201);

        const intake = await call('POST', '/intake', {
          source: 'chat',
          kind: 'new_request',
          dedupe_key: 'probe8-1',
          actor: { type: 'user', id: 'probe' },
          project: 'fixture',
          payload: {
            text: 'Add a function add(a, b) to src/math.js and a test for it in test/math.test.js.',
          },
          received_at: new Date().toISOString(),
        });

        expect(intake.status).toBe(202);

        // Not `waitFor`: it swallows errors until its deadline, and a parked ticket must
        // fail the probe now, not after the full wait.
        const deadline = Date.now() + FIFTEEN_MINUTES;
        for (;;) {
          const status = (await call('GET', `/tickets/${TICKET}`)).body as TicketView;
          const state = status.ticket?.status;
          if (state === 'done') {
            break;
          }

          if (STOPPED_STATUSES.includes(state ?? '')) {
            diagnosis = await collectDiagnosis(server, TICKET);
            throw new Error(describeStop(diagnosis));
          }

          if (Date.now() > deadline) {
            throw new Error(
              `timed out waiting for the ticket to reach done (at ${state})`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }

        diagnosis = await collectDiagnosis(server, TICKET);
        const last = diagnosis.runs.at(-1);
        const runId = last?.run.id ?? '';
        const events = last?.events ?? [];
        const receipts = last?.receipts ?? [];
        const decided = new Set(
          receipts
            .filter((r): r is DecisionReceipt => r.kind === 'decision')
            .map((r) => r.id),
        );

        const calls = events.flatMap((e) => (e.type === 'tool_call' ? [e] : []));
        const secret = server.runSecrets.secret(runId);

        expect(diagnosis.gateResults.at(-1)).toMatchObject({
          gate: 'G1',
          status: 'passed',
        });

        expect(git(fixture.remote, 'show', 'main:src/math.js')).toMatch(/add/);
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.filter((c) => !decided.has(c.call_id)).map((c) => c.name)).toEqual(
          [],
        );

        expect(secret).not.toBeNull();
        expect(verifyChain(receipts, secret ?? '').ok).toBe(true);
        expect(events.some((e) => e.type === 'hook_liveness')).toBe(true);
        expect(last?.run.hook_registered_at).toBeTruthy();
        passed = true;
      } finally {
        diagnosis ??= await collectDiagnosis(server, TICKET).catch(() => null);
        writeArtefacts(out, fixture.dataHome, diagnosis, log.join(''));
        await server.stop();
        if (passed) {
          fixture.dispose();
        } else {
          // The temp repo holds the worktree, hook files and bare remote the failure needs.
          process.stderr.write(
            `probe 8 failed: fixture kept at ${fixture.root} (remote ${fixture.remote}); artefacts in ${out}
`,
          );
        }
      }
    },
    FIFTEEN_MINUTES + 120_000,
  );
});
