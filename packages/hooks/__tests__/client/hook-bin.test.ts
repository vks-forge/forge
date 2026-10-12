/**
 * Pins: `node bin/hook.js` as the harness runs it (separate process, built dist).
 *
 * Why: the unit tests prove the logic; this proves the shipped wiring: the built entry
 * resolves its imports without the development condition, reads stdin, and exits with
 * the code the harness will see. A broken build must also exit 2, not node's 1.
 *
 * Depends on: helpers/http-server, helpers/fixtures. IO: runs tsc -b, spawns node, temp files.
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { post, pre } from '#tests/helpers/fixtures.js';
import { startServer } from '#tests/helpers/http-server.js';
import type { Reply } from '#tests/helpers/http-server.js';

const pkg = resolve(import.meta.dirname, '../..');
const bin = join(pkg, 'bin', 'hook.js');
let dir: string;

beforeAll(() => {
  // The hook runs from dist/; make sure it matches the current source.
  execFileSync(process.execPath, [
    resolve(pkg, '../../node_modules/typescript/bin/tsc'),
    '-b',
    join(pkg, 'tsconfig.json'),
  ]);
  dir = mkdtempSync(join(tmpdir(), 'forge-hook-'));
}, 180_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function exec(stdin: unknown, env: Record<string, string>) {
  return new Promise<{ code: number | null; stderr: string }>((done) => {
    const child = spawn(process.execPath, [bin], {
      env: { PATH: process.env['PATH'] ?? '', ...env },
    });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += String(c)));
    child.on('close', (code) => done({ code, stderr }));
    child.stdin.end(JSON.stringify(stdin));
  });
}

async function withServer(reply: Reply, timeout_ms = 2000) {
  const s = await startServer(reply);
  const path = join(dir, `hook-${Math.random()}.json`);
  writeFileSync(
    path,
    JSON.stringify({ run_id: 'r', server_url: s.url, token: 't', timeout_ms }),
  );
  return { s, env: { FORGE_HOOK_CONFIG: path } };
}

const allow = {
  body: JSON.stringify({ decision: 'allow', reason: 'ok', receipt_hash: '' }),
};

describe('bin/hook.js', () => {
  it('allow exits 0', async () => {
    const { s, env } = await withServer(allow);
    expect((await exec(pre(), env)).code).toBe(0);
    await s.close();
  });

  it('deny exits 2 with the reason on stderr', async () => {
    const body = JSON.stringify({
      decision: 'deny',
      reason: 'rule_deny',
      receipt_hash: '',
    });
    const { s, env } = await withServer({ body });
    const r = await exec(pre(), env);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe('forge-hook: denied: rule_deny\n');
    await s.close();
  });

  it('server down exits 2', async () => {
    const { s, env } = await withServer(allow);
    await s.close();
    expect((await exec(pre(), env)).code).toBe(2);
  });

  it('timeout exits 2', async () => {
    const { s, env } = await withServer({ ...allow, delayMs: 1500 }, 150);
    expect((await exec(pre(), env)).code).toBe(2);
    await s.close();
  });

  it('missing config exits 2', async () => {
    const r = await exec(pre(), { FORGE_HOOK_CONFIG: join(dir, 'nope.json') });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('config_unreadable');
  });

  it('PostToolUse server error exits 0', async () => {
    const { s, env } = await withServer({ status: 500 });
    expect((await exec(post(), env)).code).toBe(0);
    await s.close();
  });
});
