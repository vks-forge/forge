/**
 * Fake `claude` executable: replays a stream-json fixture, then exits.
 *
 * Why: the CLI engine hosts `claude -p --output-format stream-json`. Its behaviour (flags,
 *   prompt on stdin, line parsing, result handling, what happens when the process dies or
 *   hangs after printing its result) can be pinned only against something that behaves
 *   like the binary but costs nothing. The test points the driver's spawn at this script
 *   with `process.execPath`, and steers it with env vars: the fixture to replay, the exit
 *   code, whether to hang after the output, and a file where it records argv and stdin.
 *
 * Exports: none (script).
 * Depends on: node:fs. IO: reads a fixture, writes a record file.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const env = process.env;

if (argv.includes('--version')) {
  process.stdout.write('2.1.296 (Claude Code)\n');
  process.exit(0);
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  if (env.FAKE_CLAUDE_RECORD)
    writeFileSync(
      env.FAKE_CLAUDE_RECORD,
      JSON.stringify({
        argv,
        stdin,
        cwd: process.cwd(),
        env: Object.fromEntries(
          Object.entries(env).filter(([k]) => /^(CLAUDE|FORGE|FAKE)/.test(k)),
        ),
      }),
    );
  const lines = readFileSync(env.FAKE_CLAUDE_FIXTURE, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0);
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (env.FAKE_CLAUDE_STDERR) process.stderr.write(env.FAKE_CLAUDE_STDERR);
  if (env.FAKE_CLAUDE_HANG === '1') setInterval(() => undefined, 1_000);
  else process.exit(Number(env.FAKE_CLAUDE_EXIT ?? '0'));
});
