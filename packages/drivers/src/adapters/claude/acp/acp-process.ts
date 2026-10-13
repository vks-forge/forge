/**
 * Starts the ACP adapter process and watches it die.
 *
 * Why: a run has to learn two things about its adapter that the protocol cannot tell it:
 *   that the process exited (a crash while a request is pending would otherwise hang the
 *   run forever) and how to take the whole tree down, with the adapter's last stderr lines
 *   attached to the crash so the failure is diagnosable. The kill is idempotent and skips a
 *   process that already exited, so a graceful end, a cancel timeout and cleanup can all
 *   ask for it without signalling a recycled pid twice.
 *
 * Exports: startAdapterProcess().
 * Depends on: process-tree, types/claude/engine, types/claude/acp. IO: spawns the adapter.
 */

import { killTree } from '#/adapters/claude/process-tree.js';
import type { AdapterProcess } from '#/types/claude/acp.types.js';
import type { EngineDeps, EngineEnd, EngineLaunch } from '#/types/claude/engine.types.js';

/** Spawns `node <entry>` in the run dir; null when the process cannot even be created. */
export function startAdapterProcess(
  deps: EngineDeps,
  entry: string,
  launch: EngineLaunch,
): AdapterProcess | null {
  let child: AdapterProcess['child'];
  try {
    child = deps.spawn(process.execPath, [entry], {
      cwd: launch.prepared.runDir,
      env: launch.env,
      detached: deps.platform !== 'win32',
    });
  } catch {
    return null;
  }

  let stderrTail = '';
  child.stderr.on(
    'data',
    (d: Buffer) => (stderrTail = (stderrTail + d.toString('utf8')).slice(-1500)),
  );

  let exited = false;
  const exitedEnd = new Promise<EngineEnd>((resolve) => {
    child.on('exit', (code, signal) => {
      exited = true;
      resolve({
        kind: 'crash',
        detail: `adapter exited (code ${code}, signal ${signal}) ${stderrTail}`.trim(),
      });
    });

    child.on('error', (e) => {
      exited = true;
      resolve({ kind: 'crash', detail: `adapter failed: ${e.message}` });
    });
  });

  let killed = false;
  const kill = async (): Promise<void> => {
    if (killed || exited) {
      return;
    }

    killed = true;
    await killTree(child, {
      platform: deps.platform,
      spawn: deps.spawn,
      ...(deps.signalGroup ? { signalGroup: deps.signalGroup } : {}),
    });
  };

  return { child, exitedEnd, kill, hasExited: () => exited };
}
