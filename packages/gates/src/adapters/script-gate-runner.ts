/**
 * Script gate runner — runs an owner-written command as a pipeline gate and judges its exit code.
 *
 * Why: an owner can make any command a gate (d-0074): exit 0 passes. The Worker wrote the code
 *   the command judges and could also have written the command's script, or edited a file the
 *   owner guarded (a CI config, a lint rule). A gate it can rewrite grades its own work, so the
 *   diff is checked first and a touch of a guarded path fails the gate closed without running
 *   anything: the owner's explicit guard globs, the script the command starts (a relative first
 *   token, or the script an interpreter such as `node` or `bash` is given). The command then runs
 *   outside the Worker's control with the same stripped environment as G1. `expect: 'fail'` is
 *   the red proof: the new tests are supposed to fail before the implementation exists, so a
 *   non-zero exit is the pass and a green run is the finding "the tests already pass". A timeout
 *   or a command that cannot start is `error`, never a pass. The tool folders the worktree's
 *   setup recorded (`.venv/bin`) go first on PATH and may be run from.
 *
 * Exports: createScriptGateRunner().
 * Depends on: @forge/core (ScriptGateRunner, globMatch), adapters/command-runner, shared/env,
 *   shared/tail, types/script-gate. Spawns processes through the injected runner.
 */

import { delimiter, isAbsolute, relative, resolve } from 'node:path';
import { globMatch } from '@forge/core';
import type {
  GateFinding,
  GateVerdict,
  ScriptGateRequest,
  ScriptGateRunner,
} from '@forge/core';
import { runShellCommand } from '#/adapters/command-runner.js';
import { prependPath, scrubEnv } from '#/shared/env.js';
import { tail } from '#/shared/tail.js';
import type { ScriptGateDeps } from '#/types/script-gate.types.js';

const INTERPRETERS = new Set([
  'node',
  'python',
  'python3',
  'bash',
  'sh',
  'pwsh',
  'powershell',
  'ruby',
  'deno',
  'bun',
]);

const FINDING_TAIL_CHARS = 1500;

const unquote = (t: string): string => t.replace(/^["']|["']$/g, '');
const hasSeparator = (t: string): boolean => /[\\/]/.test(t);
const isRelative = (t: string): boolean => !isAbsolute(t) && !/^[a-z]:/i.test(t);
const looksLikeScript = (t: string): boolean =>
  !t.startsWith('-') && isRelative(t) && (hasSeparator(t) || /\.[a-z0-9]{1,5}$/i.test(t));

/** Paths the command itself starts from: its relative first token, or the script an interpreter is given. */
function commandPaths(command: string): string[] {
  const tokens = command.trim().split(/\s+/).map(unquote);
  const first = tokens[0] ?? '';
  const out: string[] = [];
  if (hasSeparator(first) && isRelative(first)) {
    out.push(first.replace(/^\.[\\/]/, ''));
  }

  if (INTERPRETERS.has(first.toLowerCase().replace(/\.exe$/, ''))) {
    const script = tokens.slice(1).find((t) => !t.startsWith('-'));
    if (script !== undefined && looksLikeScript(script)) {
      out.push(script.replace(/^\.[\\/]/, ''));
    }
  }

  return out;
}

const insideTree = (root: string, dir: string): boolean => {
  const rel = relative(resolve(root), resolve(root, dir));

  return !rel.startsWith('..') && !isAbsolute(rel);
};

function verdict(
  status: GateVerdict['status'],
  findings: GateFinding[],
  report: string,
): GateVerdict {
  return { status, findings, report };
}

/** Builds the runner; see the file header for what it decides. */
export function createScriptGateRunner(deps: ScriptGateDeps): ScriptGateRunner {
  const spawn = deps.runCommand ?? runShellCommand;

  return {
    async run(req: ScriptGateRequest): Promise<GateVerdict> {
      const finding = (message: string): GateFinding => ({ check: 'script', message });
      const refuse = (message: string): GateVerdict =>
        verdict('failed', [finding(message)], `script gate refused: ${message}`);

      if (
        req.cwd !== undefined &&
        (isAbsolute(req.cwd) || !insideTree(req.worktreePath, req.cwd))
      ) {
        return refuse(`the working directory "${req.cwd}" is outside the worktree`);
      }

      const diff = await deps.worktrees.diff(req.worktreePath, req.baseSha);
      const changed = diff.files.flatMap((f) =>
        f.oldPath ? [f.path, f.oldPath] : [f.path],
      );

      const guards = [...req.guardPaths, ...commandPaths(req.command)];
      const touched = changed.find((p) => guards.some((g) => globMatch(g, p, true)));
      if (touched !== undefined) {
        return refuse(
          `the Worker changed ${touched}, which this gate guards; a gate cannot judge work that edits it`,
        );
      }

      const cwd =
        req.cwd === undefined ? req.worktreePath : resolve(req.worktreePath, req.cwd);

      const dirs = (await deps.worktrees.readPrep?.(req.worktreePath))?.path ?? [];
      let result;
      try {
        result = await spawn({
          command: req.command,
          cwd,
          env: prependPath(scrubEnv(deps.env, deps.passEnv), dirs, delimiter),
          timeoutMs: req.timeoutMs,
          ...(dirs.length === 0 ? {} : { trustedDirs: dirs }),
        });
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);

        return verdict(
          'error',
          [finding(`\`${req.command}\` could not run: ${why}`)],
          `script gate could not run \`${req.command}\`: ${why}`,
        );
      }

      const output = tail(result.output).trimEnd();
      const how = result.timedOut
        ? `timed out after ${req.timeoutMs} ms`
        : `exit code ${String(result.exitCode)}`;

      const report = [
        `command: ${req.command}`,
        `cwd: ${cwd}`,
        `expect: ${req.expect}`,
        `result: ${how}`,
        '',
        output,
      ].join('\n');

      if (result.timedOut) {
        return verdict('error', [finding(`\`${req.command}\` ${how}`)], report);
      }

      const green = result.exitCode === 0;
      if (req.expect === 'fail') {
        return green
          ? verdict(
              'failed',
              [
                finding(
                  'the new tests already pass: nothing proves they test the missing work',
                ),
              ],
              report,
            )
          : verdict('passed', [], report);
      }

      if (green) {
        return verdict('passed', [], report);
      }

      const detail = tail(result.output, FINDING_TAIL_CHARS).trimEnd();

      return verdict(
        'failed',
        [
          finding(
            `\`${req.command}\` failed: ${how}${detail === '' ? '' : `\n${detail}`}`,
          ),
        ],
        report,
      );
    },
  };
}
