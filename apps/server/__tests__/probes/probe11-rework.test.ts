/**
 * Probe 11: the rework path on the real Claude harness (billable, gated).
 *
 * Why: when G1 rejects a Worker's change, the Director must send the ticket back with the
 *   findings, start a second run whose prompt carries them, and let that run fix the change
 *   and merge. The in-process tests drive this with a scripted Worker; only the real thing
 *   shows whether a real Worker, told by the contract that the earlier run was rejected by
 *   the gates, reads the findings and acts on them (and claims its edits so G1 passes).
 *
 * Pins: the project's test check also runs a script that lives OUTSIDE the worktree and
 *   demands `export const BATCH_LIMIT = 7` in `src/math.js`; the ticket never mentions the
 *   name or the value, so the first attempt cannot pass and the value is knowable only from
 *   G1's failure output. Asserted: the first G1 fails with the project-check finding naming
 *   `BATCH_LIMIT`, the ticket went back to in_progress with rework_count 1, a second run
 *   ran, its G1 passed, the ticket is `done`, and the bare remote's `main` holds
 *   `BATCH_LIMIT = 7` (proof the findings reached the second Worker). A parked ticket fails
 *   the probe at once with the reason. Artefacts go to `.forge/data/probes/11/`.
 * Models: the production matrix (d-0060): Director steps on opus, Workers on sonnet.
 * Depends on: a prior `pnpm build` (the hook and MCP server run from `dist/`), a logged-in
 *   `claude`. IO: spawns the real adapter and `claude -p`, git, a loopback socket.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJsonLogger } from '@forge/engine';
import { createDpapiSecretStore } from '@forge/secrets';
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
import { trackTemp } from '#tests/helpers/temp.js';
import { createRecordingSecrets } from '#tests/helpers/recording-secrets.js';
import { bearer, readInstallToken } from '#tests/helpers/install-token.js';

const probe = it.skipIf(!PROBES_ENABLED);
const TWENTY_MINUTES = 20 * 60_000;
const POLL_MS = 2_000;
const TICKET = 'FX-1';

interface TicketView {
  ticket: { status: string; rework_count: number };
}

/**
 * The extra check: runs in the worktree, lives beside the repository (outside the worktree).
 * The export it demands is read from a file in the data home, which a Worker cannot read, so
 * neither the name nor the value is learnable except from this script's failure output.
 */
const verifyScript = (
  expectedFile: string,
): string => `import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [name, value] = readFileSync(${JSON.stringify(expectedFile)}, 'utf8').trim().split('=');
const mod = await import(pathToFileURL(resolve('src', 'math.js')).href);
if (mod.add?.(2, 3) !== 5) {
  console.error('verify: add(2, 3) must return 5');
  process.exit(1);
}

if (String(mod[name]) !== value) {
  console.error('verify: src/math.js must export const ' + name + ' = ' + value + ' (the batch size cap), found ' + String(mod[name]));
  process.exit(1);
}
`;

/** Every file under `dir`, concatenated (the gate reports of a run); token files skipped. */
function readTree(dir: string): string {
  let text = '';
  for (const name of readdirSync(dir)) {
    if (name === 'hook.json' || name === 'mcp.json') {
      continue;
    }

    const path = join(dir, name);
    text += statSync(path).isDirectory()
      ? readTree(path)
      : `\n${readFileSync(path, 'utf8')}`;
  }

  return text;
}

describe('probe 11: a failed G1 sends the ticket to rework on the real Claude harness', () => {
  probe(
    `fails G1 once, reworks with the findings and merges ${SKIP_REASON}`,
    async () => {
      const out = probeDir('11');
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
      const secrets = createRecordingSecrets(
        createDpapiSecretStore({ dir: loaded.layout.data.secretsDir }),
      );

      const server = await assembleServer(loaded, {
        ...createClaudePorts(loaded, write),
        secrets,
      });

      const address = await server.start();
      await server.compat.idle();
      const captured = await server.compat.tools('claude');
      for (const t of captured.tools.filter((row) => row.status === 'pending')) {
        await server.compat.decide('claude', t.tool, 'approved', {
          author: 'probe11',
          reason: 'live probe approves the shapes the check captured',
        });
      }

      expect((await server.compat.view('claude')).compat).not.toBe('fail');
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
        // Beside the repository, not in the data home: the Worker's tool policy refuses any
        // command that names the data home, and G1's findings quote the check command.
        const checkDir = trackTemp(`${fixture.root}-check`);
        mkdirSync(checkDir, { recursive: true });
        const script = join(checkDir, 'verify.mjs');
        mkdirSync(fixture.dataHome, { recursive: true });
        const expected = join(fixture.dataHome, 'probe11-expected.txt');
        writeFileSync(expected, 'BATCH_LIMIT=7');
        writeFileSync(script, verifyScript(expected));

        // A separate check so `npm test` stays the one plain command the Worker may run; the
        // gates re-run both.
        const body = fixtureProjectBody(fixture);
        const settings = body['settings'] as { checks: object[] };
        settings.checks.push({
          name: 'verify',
          role: 'custom',
          command: `node "${script}"`,
        });

        expect((await call('POST', '/projects', body)).status).toBe(201);

        const intake = await call('POST', '/intake', {
          source: 'chat',
          kind: 'new_request',
          dedupe_key: 'probe11-1',
          actor: { type: 'user', id: 'probe' },
          project: 'fixture',
          payload: {
            card_type: 'pr_issue',
            text: "Add a function add(a, b) to src/math.js and a test for it in test/math.test.js. Keep to the module's conventions, including its caps.",
          },
          received_at: new Date().toISOString(),
        });

        expect(intake.status).toBe(202);

        let maxRework = 0;
        const deadline = Date.now() + TWENTY_MINUTES;
        for (;;) {
          const view = (await call('GET', `/tickets/${TICKET}`)).body as TicketView;
          const state = view.ticket?.status;
          maxRework = Math.max(maxRework, view.ticket?.rework_count ?? 0);
          if (state === 'done') {
            break;
          }

          if (STOPPED_STATUSES.includes(state ?? '')) {
            diagnosis = await collectDiagnosis(server, TICKET);
            throw new Error(describeStop(diagnosis));
          }

          if (Date.now() > deadline) {
            throw new Error(`timed out waiting for done (at ${state})`);
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }

        diagnosis = await collectDiagnosis(server, TICKET);
        const g1 = diagnosis.gateResults.filter((g) => g.gate === 'G1');
        const [first, second] = diagnosis.runs;

        expect(diagnosis.runs.length).toBe(2);
        expect(maxRework).toBe(1);
        expect(g1.map((g) => g.status)).toEqual(['failed', 'passed']);
        expect(g1[0]?.run_id).toBe(first?.run.id);
        expect(g1[1]?.run_id).toBe(second?.run.id);

        // The failed run's gate report names the project check and the missing export.
        const report = readTree(join(fixture.dataHome, 'runs', first?.run.id ?? ''));
        expect(report).toMatch(/project:verify|verify/);
        expect(report).toContain('BATCH_LIMIT');

        // The value only the failure output revealed is what got merged.
        expect(git(fixture.remote, 'show', 'main:src/math.js')).toMatch(
          /BATCH_LIMIT\s*=\s*7/,
        );

        passed = true;
      } finally {
        diagnosis ??= await collectDiagnosis(server, TICKET).catch(() => null);
        writeArtefacts(out, fixture.dataHome, diagnosis, log.join(''));
        await server.stop();
        if (passed) {
          fixture.dispose();
        } else {
          process.stderr.write(
            `probe 11 failed: fixture kept at ${fixture.root} (remote ${fixture.remote}); artefacts in ${out}\n`,
          );
        }
      }
    },
    TWENTY_MINUTES + 120_000,
  );
});
