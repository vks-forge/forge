/**
 * Runs a short command and returns what it printed on stdout.
 *
 * Why: asking the installed `claude` for its version, its login state or a one-word reply
 *   are all the same shape: start it without a shell, optionally feed stdin, read stdout to
 *   the end, give up after a deadline. A missing binary, a hang and a spawn failure all
 *   map to `null`, so a Settings test or a preflight reports "did not answer" instead of
 *   throwing. The deadline kills the child so a hung probe never outlives the request.
 *
 * Exports: captureOutput().
 * Depends on: types/claude/{driver-deps,harness}. IO: spawns one short-lived process.
 */

import { StringDecoder } from 'node:string_decoder';
import type { Clock, SpawnFn } from '#/types/claude/driver-deps.types.js';
import type { CaptureOptions } from '#/types/claude/harness.types.js';

/** Stdout of the command, or null if it cannot start, errors or outlives `timeoutMs`. */
export function captureOutput(
  spawn: SpawnFn,
  clock: Clock,
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  opts: CaptureOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let cancel = (): void => undefined;
    const finish = (value: string | null): void => {
      if (done) {
        return;
      }

      done = true;
      cancel();
      resolve(value);
    };

    try {
      const child = spawn(command, args, { env });
      const decoder = new StringDecoder('utf8');
      child.stdout.on('data', (chunk: Buffer) => (out += decoder.write(chunk)));
      child.stdin.on('error', () => undefined);
      child.stdin.end(opts.stdin);
      child.on('error', () => finish(null));
      // stdout 'end', not process 'exit': exit can fire before the last chunk is read.
      child.stdout.on('end', () => finish(out + decoder.end()));
      cancel = clock.after(opts.timeoutMs, () => {
        child.kill('SIGKILL');
        finish(null);
      });
    } catch {
      finish(null);
    }
  });
}
