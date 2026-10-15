/**
 * The Write variants the fake Worker uses to leave a stop landing inside a tool call.
 *
 * Why: whether a graceful stop saves a Worker's edit depends on where the stop lands. A Write
 *   that never completes after the edit (the process dies before PostToolUse) is the case the
 *   server cannot save and G1 must fail closed; a Write that merely takes a second between the
 *   edit and PostToolUse is the case the shutdown drain must wait for. Both are scripted here,
 *   deterministically, so the end-to-end tests pin each outcome instead of racing for it.
 *
 * Exports: CutOff, SLOW_WRITE_MS, writeFile(), cutWrite(), slowWrite().
 * Depends on: node:fs, node:path. IO: writes files.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Thrown inside a tool call the server's stop cut off; ends the run as cancelled, not as a script error. */
export class CutOff extends Error {}

/** How long the slow Write takes between the edit and its PostToolUse. */
export const SLOW_WRITE_MS = 1_000;

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A tool body that writes `content` to `path` and returns what the harness would report. */
export const writeFile = (path: string, content: string) => (): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);

  return `wrote ${path}`;
};

/** The edit lands, then the process dies before PostToolUse is posted: waits for the stop, then throws `CutOff`. */
export const cutWrite = (edit: () => string, parked: () => Promise<void>) => async () => {
  edit();
  await parked();

  throw new CutOff('stopped inside Write');
};

/**
 * The edit lands and PostToolUse follows about a second later; part way through, `parallel`
 * (a second tool call, as a harness may issue while one is running) is started.
 */
export const slowWrite =
  (edit: () => string, parallel: () => Promise<unknown>) => async () => {
    const reported = edit();
    const other = pause(SLOW_WRITE_MS * 0.6).then(parallel);

    await pause(SLOW_WRITE_MS);
    await other;

    return reported;
  };
