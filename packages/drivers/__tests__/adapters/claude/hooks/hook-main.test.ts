/**
 * Pins: the hook client's exit code and stderr for every answer and failure.
 *
 * Why: the harness obeys only the exit code, and its default on failure is to let the
 * tool run. So allow must exit 0, deny/ask and every failure before a tool runs must
 * exit 2 with a one-line reason, and after-the-fact events must never block.
 *
 * Depends on: helpers/http-server, helpers/hook-fixtures, src/adapters/claude/hooks/hook-main.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { main, readStream, runHook } from '#/adapters/claude/hooks/hook-main.js';
import type { HookIo } from '#/types/claude/hook-client.types.js';
import { failure, post, pre, sessionStart } from '#tests/helpers/hook-fixtures.js';
import { startServer } from '#tests/helpers/http-server.js';
import { makeTempDir } from '#tests/helpers/temp.js';
import type { Reply, TestServer } from '#tests/helpers/http-server.js';

const answer = (
  decision: string,
  reason = 'r',
  receipt_hash = 'ab'.repeat(32),
): Reply => ({
  body: JSON.stringify({ decision, reason, receipt_hash }),
});

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function io(stdin: unknown, cfg: object | null, over: Partial<HookIo> = {}): HookIo {
  return {
    stdin: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { FORGE_HOOK_CONFIG: '/cfg.json' },
    argv: [],
    fetch: (u, i) => fetch(u, i),
    readFile: async () => {
      if (cfg === null) {
        throw new Error('ENOENT');
      }

      return JSON.stringify(cfg);
    },
    now: () => 42,
    ...over,
  };
}

async function run(reply: Reply, payload: unknown, timeout_ms = 2000) {
  server = await startServer(reply);
  const cfg = { run_id: 'r 1', server_url: `${server.url}/`, token: 'tok', timeout_ms };

  return runHook(io(payload, cfg));
}

describe('runHook', () => {
  it('allow exits 0, silently, and posts token, event and seq', async () => {
    const r = await run(answer('allow'), pre());
    expect(r).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    const seen = server?.seen[0];
    expect(seen?.path).toBe('/runs/r%201/hook');
    expect(seen?.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(seen?.body ?? '{}')).toMatchObject({
      event: 'PreToolUse',
      seq: 42,
    });
  });

  it('deny exits 2 with the reason and receipt prefix on one stderr line', async () => {
    const r = await run(answer('deny', 'rule_deny'), pre());
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(`forge-hook: denied: rule_deny [receipt ${'ab'.repeat(6)}]\n`);
  });

  it('ask exits 2', async () => {
    const r = await run(answer('ask', 'rule_ask'), pre());
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('needs approval');
  });

  it.each([
    ['non-2xx', { status: 500, body: '{}' }],
    ['garbage body', { body: 'not json' }],
    ['wrong shape', { body: JSON.stringify({ decision: 'allow' }) }],
  ])('PreToolUse %s exits 2', async (_n, reply) => {
    const r = await run(reply, pre());
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/^forge-hook: fail-closed: /);
  });

  it('timeout exits 2', async () => {
    const r = await run({ ...answer('allow'), delayMs: 1000 }, pre(), 100);
    expect(r).toMatchObject({ exitCode: 2 });
    expect(r.stderr).toContain('timeout');
  });

  it('server down exits 2', async () => {
    const s = await startServer({});
    const url = s.url;
    await s.close();
    const cfg = { run_id: 'r', server_url: url, token: 't', timeout_ms: 500 };
    expect((await runHook(io(pre(), cfg))).exitCode).toBe(2);
  });

  it('missing, unreadable or invalid config exits 2', async () => {
    expect((await runHook(io(pre(), null, { env: {} }))).stderr).toContain(
      'config_missing',
    );

    expect((await runHook(io(pre(), null))).stderr).toContain('config_unreadable');
    const bad = io(pre(), {}, { readFile: async () => 'nope' });
    expect((await runHook(bad)).stderr).toContain('config_invalid');
    expect((await runHook(io(pre(), {}))).stderr).toContain('config_invalid');
  });

  it('reads the config path from --config when the env var is absent', async () => {
    server = await startServer(answer('allow'));
    const cfg = { run_id: 'r', server_url: server.url, token: 't', timeout_ms: 1000 };
    let asked = '';
    const r = await runHook(
      io(pre(), cfg, {
        env: {},
        argv: ['--config', '/a.json'],
        readFile: async (p) => {
          asked = p;

          return JSON.stringify(cfg);
        },
      }),
    );

    expect(r.exitCode).toBe(0);
    expect(asked).toBe('/a.json');
    const eq = io(pre(), cfg, {
      env: {},
      argv: ['--config=/b.json'],
      readFile: async (p) => (asked = p),
    });

    await runHook(eq);
    expect(asked).toBe('/b.json');
  });

  it('--config argv wins over FORGE_HOOK_CONFIG when both are present', async () => {
    server = await startServer(answer('allow'));
    const cfg = { run_id: 'r', server_url: server.url, token: 't', timeout_ms: 1000 };
    const asked: string[] = [];
    const base = {
      env: { FORGE_HOOK_CONFIG: '/from-env.json' },
      readFile: async (p: string) => {
        asked.push(p);

        return JSON.stringify(cfg);
      },
    };

    await runHook(io(pre(), cfg, { ...base, argv: ['--config', '/from-argv.json'] }));
    await runHook(io(pre(), cfg, { ...base, argv: ['--config=/eq.json'] }));
    await runHook(io(pre(), cfg, { ...base, argv: [] }));
    expect(asked).toEqual(['/from-argv.json', '/eq.json', '/from-env.json']);
  });

  it('bad stdin exits 2; unknown event exits 2', async () => {
    expect((await runHook(io('{{', {}))).exitCode).toBe(2);
    expect((await runHook(io({ hook_event_name: 'Stop' }, {}))).exitCode).toBe(2);
    expect((await runHook(io({ hook_event_name: 'PreToolUse' }, {}))).exitCode).toBe(2);
  });

  it('SessionStart non-2xx exits 2, allow exits 0', async () => {
    expect((await run({ status: 503 }, sessionStart())).exitCode).toBe(2);
    await server?.close();
    expect((await run(answer('allow'), sessionStart())).exitCode).toBe(0);
  });

  it('PostToolUse never blocks, but logs a server error', async () => {
    const r = await run({ status: 500 }, post());
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/^forge-hook: not recorded: server_status_500/);
    await server?.close();
    expect((await run(answer('deny'), failure())).exitCode).toBe(0);
    expect((await runHook(io({ hook_event_name: 'PostToolUse' }, null))).exitCode).toBe(
      0,
    );
  });
});

describe('main and readStream', () => {
  const fake = (input: string, env: Record<string, string>) => {
    const out = { stdout: '', stderr: '' };

    return {
      out,
      proc: {
        stdin: Readable.from([Buffer.from(input)]),
        stdout: { write: (t: string, cb: () => void) => ((out.stdout += t), cb()) },
        stderr: { write: (t: string, cb: () => void) => ((out.stderr += t), cb()) },
        env,
        argv: ['node', 'hook.js'],
      },
    };
  };

  it('runs end to end against a server and returns the exit code', async () => {
    server = await startServer(answer('deny', 'nope'));
    const dir = makeTempDir('forge-main-');
    const cfg = join(dir, 'hook.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        run_id: 'r',
        server_url: server.url,
        token: 't',
        timeout_ms: 1000,
      }),
    );

    const { proc, out } = fake(JSON.stringify(pre()), { FORGE_HOOK_CONFIG: cfg });
    expect(await main(proc)).toBe(2);
    expect(out.stderr).toContain('denied: nope');
  });

  it('fails closed when stdin never ends', async () => {
    const never = (async function* () {
      await new Promise(() => undefined);
      yield Buffer.alloc(0);
    })();

    await expect(readStream(never, 20)).rejects.toThrow('stdin_timeout');
    const { proc, out } = fake('', {});
    expect(await main({ ...proc, stdin: never })).toBe(2);
    expect(out.stderr).toContain('fail-closed');
  }, 10_000);
});
