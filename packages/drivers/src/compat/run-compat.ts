/**
 * Runs the compatibility check of one installed harness build and returns its report.
 *
 * Why: Forge runs whichever `claude` the owner installed and does not pin a version
 *   (d-0088). Before Workers are trusted with a new build, it is driven here exactly as a
 *   Worker would be: through the real driver, the real hook, the real engine, against a
 *   local scripted stand-in for the model, in a throwaway folder. The session exercises
 *   Write, Read, Grep, Glob, Edit and the shell, and has the hook deny one write. What the
 *   build did is judged by `evaluateChecks`, and the exact tool schemas it sent to the
 *   model are captured for approval. The check spends no money, touches nothing of the
 *   owner's, never sees their login (it uses a throwaway config folder and a fake key) and
 *   cleans up after itself. It never throws for a build that misbehaves: a harness that
 *   cannot be driven is a failed check with a reason, which pauses it.
 *
 * Exports: runCompatCheck().
 * Depends on: @forge/core (CompatReport, harnessSecretName, RunRequest), @forge/tools
 *   (Decision), adapters/claude/claude-driver, compat/{evaluate,fake-model-api,tool-shapes},
 *   types/compat. IO: spawns the harness, a local HTTP server, writes under the temp folder.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunRequest, harnessSecretName } from '@forge/core';
import type { CompatReport, RunEvent, SecretStore } from '@forge/core';
import type { Decision } from '@forge/tools';
import { createClaudeDriver } from '#/adapters/claude/claude-driver.js';
import { evaluateChecks, summarize } from '#/compat/evaluate.js';
import { startFakeModelApi } from '#/compat/fake-model-api.js';
import { sessionScript } from '#/compat/session-script.js';
import { toolShapes } from '#/compat/tool-shapes.js';
import { CLAUDE_MODELS } from '#/domain/claude-models.js';
import type {
  CompatDeps,
  CompatTrace,
  HookObservation,
  HookServer,
} from '#/types/compat/compat.types.js';

const RUN_ID = 'compat-run';
const TOKEN = 'compat-hook-token';
const API_KEY = 'sk-ant-compat-not-a-real-key';
const DEFAULT_TIMEOUT_MS = 180_000;

const decision = (verdict: 'allow' | 'deny', tool: string): Decision => ({
  decision: verdict,
  reason: verdict === 'allow' ? 'rule_allow' : 'rule_deny',
  enforced_by: 'forge_admit',
  enforcement: 'hook',
  layer: 'rule',
  matched_rule: null,
  finding_ids: [],
  tool,
});

/** Plays the Forge hook route: records every post, allows everything except the denied write. */
async function startHookServer(): Promise<HookServer> {
  const seen: HookObservation[] = [];
  const denied = new Set<string>();
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')));
    req.on('end', () => {
      let parsed: { event?: string; payload?: Record<string, unknown> } = {};
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        // A malformed post is answered below like any other; the check will not count it.
      }

      const payload = parsed.payload ?? {};
      const event = parsed.event ?? 'unknown';
      const id = typeof payload['tool_use_id'] === 'string' ? payload['tool_use_id'] : '';
      const name = typeof payload['tool_name'] === 'string' ? payload['tool_name'] : '';
      seen.push({
        event,
        ...(id ? { toolUseId: id } : {}),
        ...(name ? { toolName: name } : {}),
      });

      const deny = event === 'PreToolUse' && JSON.stringify(payload).includes('denied');
      if (deny && id) {
        denied.add(id);
      }

      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          decision: deny ? 'deny' : 'allow',
          reason: deny ? 'rule_deny' : 'rule_allow',
          receipt_hash: '',
        }),
      );
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    denied,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

const apiKeyStore = (id: string): SecretStore => ({
  get: async (name) =>
    name === harnessSecretName(id, 'api_key') ? new TextEncoder().encode(API_KEY) : null,
  put: async () => undefined,
  delete: async () => undefined,
  list: async () => [],
});

async function drive(
  deps: CompatDeps,
  dirs: { cwd: string; runDir: string; config: string },
  api: { baseUrl: string },
  hooks: HookServer,
): Promise<{ events: RunEvent[]; error: string | null }> {
  const driver = createClaudeDriver({
    config: { engine: deps.engine },
    prepareRun: async () => ({
      runDir: dirs.runDir,
      mcpServers: [],
      env: {
        ANTHROPIC_BASE_URL: api.baseUrl,
        CLAUDE_CONFIG_DIR: dirs.config,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
      hookServerUrl: hooks.url,
      hookToken: TOKEN,
    }),
    receipts: {
      decisionFor: async (_run, id) => {
        const hook = hooks.seen.find(
          (h) => h.event === 'PreToolUse' && h.toolUseId === id,
        );

        if (!hook) {
          return null;
        }

        return decision(hooks.denied.has(id) ? 'deny' : 'allow', hook.toolName ?? '');
      },
    },
    clock: deps.clock,
    spawn: deps.spawn,
    harness: () => ({ id: 'claude', binaryPath: deps.binaryPath, authMode: 'api_key' }),
    secrets: apiKeyStore('claude'),
    ...(deps.baseEnv ? { baseEnv: deps.baseEnv } : {}),
    ...(deps.platform ? { platform: deps.platform } : {}),
  });

  const events: RunEvent[] = [];
  const request = RunRequest.parse({
    runId: RUN_ID,
    projectId: 'compat',
    lane: 'standard',
    promptHash: 'c'.repeat(64),
    mcpIdentity: 'forge',
    ticketId: 'COMPAT-1',
    cwd: dirs.cwd,
    prompt: 'Run the compatibility script.',
    model: 'haiku',
    budget: { maxTurns: 20, maxUsd: 0.05, stallMs: 90_000, turnMs: 150_000 },
    env: {},
    isolation: 'host',
  });

  let handle;
  try {
    handle = await driver.start(request);
    for await (const event of driver.events(handle)) {
      events.push(event);
    }

    await driver.result(handle);

    return { events, error: null };
  } catch (error) {
    return { events, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Checks one build. `deps.version` is the build the executable reports; the report says
 * whether the session really ran that build.
 */
export async function runCompatCheck(deps: CompatDeps): Promise<CompatReport> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const root = await mkdtemp(join(deps.tempRoot ?? tmpdir(), 'forge-compat-'));
  const dirs = {
    cwd: join(root, 'work'),
    runDir: join(root, 'run'),
    config: join(root, 'cfg'),
  };

  await Promise.all(Object.values(dirs).map((d) => mkdir(d, { recursive: true })));

  const script = sessionScript(dirs.cwd);
  const api = await startFakeModelApi(script.calls);
  const hooks = await startHookServer();

  try {
    const limit = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ events: RunEvent[]; error: string | null }>(
      (resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              events: [],
              error: `no result after ${Math.round(limit / 1000)} s`,
            }),
          limit,
        );
      },
    );

    const outcome = await Promise.race([drive(deps, dirs, api, hooks), timeout]);
    clearTimeout(timer);

    const trace: CompatTrace = {
      engine: deps.engine,
      runVersion: api.version(),
      installedVersion: deps.version,
      captured: api.captured(),
      hooks: [...hooks.seen],
      events: outcome.events,
      deniedFileExists: existsSync(script.deniedFile),
      allowedFileExists: existsSync(script.allowedFile),
      runError: outcome.error,
    };

    const checks = evaluateChecks(trace, deps.nativeTools);

    return {
      kind: deps.kind,
      version: deps.version,
      started_at: startedAt.toISOString(),
      finished_at: now().toISOString(),
      passed: checks.every((c) => c.status !== 'fail'),
      summary: summarize(deps.version, checks),
      checks,
      tools: toolShapes(trace.captured, deps.nativeTools),
      // The declared models travel with the report so the agent pickers list what this build offers.
      models: [...CLAUDE_MODELS],
    };
  } finally {
    await Promise.all([api.close(), hooks.close()]);
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}
