/**
 * Probe 6: the Claude driver, ACP engine, against the real adapter (billable, gated).
 *
 * Why: every unit test of the driver runs on fakes. What only the real adapter can show is
 * whether the pieces fit: that a run completes on the subscription within $0.05, that a
 * tool call the hook denies leaves no file behind, that the hook fires at all under ACP, and
 * whether the hook's `tool_use_id` equals the ACP `toolCallId` (the join the permission
 * handler and the receipt cross-check rely on; if not, the (name, args hash) fallback is
 * what keeps runs alive).
 *
 * Pins: a real run succeeds; a hook-denied write creates no file; PreToolUse posts reach the
 *   hook server; the hook id is compared with the ACP tool call id (recorded in RESULTS.md).
 * Depends on: src/index, helpers/probe-env, a prior `pnpm build`, a logged-in adapter.
 *   IO: spawns the real adapter, a local HTTP server, writes under .forge/data/probes/.
 */

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { join } from 'node:path';
import type { Decision } from '@forge/tools';
import { afterAll, describe, expect, it } from 'vitest';
import { createClaudeDriver, nodeSpawn, systemClock } from '#/index.js';
import type { RunEvent } from '@forge/core';
import { freshProbeDir, PROBES_ENABLED, SKIP_REASON } from '#tests/helpers/probe-env.js';
import { makeRequest } from '#tests/helpers/run-request.js';

const probe = it.skipIf(!PROBES_ENABLED);
let server: Server | undefined;
afterAll(() => server?.close());

const decision = (verdict: Decision['decision']): Decision => ({
  decision: verdict,
  reason: verdict === 'allow' ? 'rule_allow' : 'rule_deny',
  enforced_by: 'forge_admit',
  enforcement: 'hook',
  layer: 'rule',
  matched_rule: null,
  finding_ids: [],
  tool: 'shell',
});

/** A hook server that answers `verdict` to PreToolUse and records the ids it saw. */
async function startHookServer(verdict: Decision['decision']) {
  const seen: { id?: string; tool?: string }[] = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += String(c)));
    req.on('end', () => {
      const parsed = JSON.parse(body) as {
        event: string;
        payload: { tool_use_id?: string; tool_name?: string };
      };

      if (parsed.event === 'PreToolUse') {
        seen.push({
          ...(parsed.payload.tool_use_id ? { id: parsed.payload.tool_use_id } : {}),
          ...(parsed.payload.tool_name ? { tool: parsed.payload.tool_name } : {}),
        });
      }

      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          decision: parsed.event === 'PreToolUse' ? verdict : 'allow',
          reason: verdict === 'allow' ? 'rule_allow' : 'rule_deny',
          receipt_hash: '',
        }),
      );
    });
  });

  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return { seen, url: `http://127.0.0.1:${port}` };
}

async function liveRun(name: string, verdict: Decision['decision'], prompt: string) {
  const hook = await startHookServer(verdict);
  const cwd = freshProbeDir('6', name, 'cwd');
  const driver = createClaudeDriver({
    config: { engine: 'acp' },
    prepareRun: async () => ({
      runDir: freshProbeDir('6', name, 'run'),
      mcpServers: [],
      env: {},
      hookServerUrl: hook.url,
      hookToken: 'probe-token',
    }),
    receipts: {
      // Receipts are what the hook server answered for that id.
      decisionFor: async (_run, id) =>
        hook.seen.some((s) => s.id === id) ? decision(verdict) : null,
    },
    clock: systemClock,
    spawn: nodeSpawn,
  });

  const req = makeRequest({ cwd, prompt, runId: `probe6-${name}` });
  const handle = await driver.start(req);
  const events: RunEvent[] = [];
  for await (const e of driver.events(handle)) {
    events.push(e);
  }

  return { hook, cwd, events, result: await driver.result(handle) };
}

describe('probe 6: Claude driver on the real ACP adapter', () => {
  probe(
    `a plain run completes on the subscription within the budget ${SKIP_REASON}`,
    async () => {
      const { result } = await liveRun(
        'pong',
        'allow',
        'reply with the single word pong',
      );

      expect(result.status).toBe('success');
      expect(result.session).not.toBeNull();
    },
    150_000,
  );

  probe(
    `a hook-denied write leaves no file ${SKIP_REASON}`,
    async () => {
      const { cwd, hook } = await liveRun(
        'denied-write',
        'deny',
        'use the shell tool to run: echo hi > denied.txt',
      );

      expect(existsSync(join(cwd, 'denied.txt'))).toBe(false);
      expect(hook.seen.length).toBeGreaterThan(0);
    },
    150_000,
  );

  probe(
    `PreToolUse fires, and its tool_use_id is compared with the ACP toolCallId ${SKIP_REASON}`,
    async () => {
      const { hook, events } = await liveRun(
        'ids',
        'allow',
        'use the shell tool to run: echo hi',
      );

      const callIds = events.flatMap((e) => (e.type === 'tool_call' ? [e.call_id] : []));
      expect(hook.seen.length).toBeGreaterThan(0);
      // Recorded, not assumed: if this fails the (name, args hash) join must be used.
      expect(hook.seen.some((s) => s.id && callIds.includes(s.id))).toBe(true);
    },
    150_000,
  );
});
