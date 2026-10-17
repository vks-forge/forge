/**
 * ScriptGateRunner port — runs one owner-written command as a pipeline gate.
 *
 * Why: a script gate is the owner's own check as a pipeline stage (d-0074): exit 0 passes, anything
 *   else fails. The command is run by a process the Worker does not control, with the same
 *   stripped environment as G1, and the Worker's own diff is checked first: a Worker that edited
 *   the script it is judged by, or the paths the owner guarded, would grade its own work, so
 *   that fails closed. `expect: 'fail'` serves the red proof, where the new tests are supposed
 *   to fail before the implementation exists. Behind a port the engine is tested with a fake and
 *   the process spawner stays in the gates package.
 *
 * Exports: ScriptGateRequest, ScriptGateRunner.
 * Depends on: types/ports/gate. Types only.
 */

import type { GateVerdict } from '#/types/ports/gate.types.js';

/** One script run: where, what, how long, which paths the Worker's diff may not touch, and what passes. */
export interface ScriptGateRequest {
  readonly worktreePath: string;
  readonly baseSha: string;
  readonly command: string;
  /** A folder inside the worktree; absent means its root. */
  readonly cwd?: string;
  readonly timeoutMs: number;
  /** Globs: a diff touching any of them fails the gate closed. */
  readonly guardPaths: readonly string[];
  /** `pass` for a gate (exit 0 passes); `fail` for the red proof (a non-zero exit is the pass). */
  readonly expect: 'pass' | 'fail';
}

export interface ScriptGateRunner {
  /** Never throws for a failing command: that is a `failed` verdict. A command that cannot start is `error`. */
  run(req: ScriptGateRequest): Promise<GateVerdict>;
}
