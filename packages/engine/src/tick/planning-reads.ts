/**
 * Planning reads: runs a step's read requests through `admit()` and the repository reader.
 *
 * Why: the survey and verify steps are tool-less model calls that may ask the engine to look at
 *   the code (d-0131, d-0141 item 4). Each request goes through `admit()` under the director
 *   grant, so a path outside the project, a credential file or any non-read tool is refused
 *   before git is asked, and the reader itself only serves git-tracked files at HEAD, so what the
 *   Director sees is what a Worker's worktree starts from. Reads are capped in files and bytes per
 *   step, results are returned as data (a refusal is a result the step sees, never a crash), and
 *   every file actually read is returned with its size so the step can log it as evidence. The
 *   runner calls the step again with these results, at most two rounds, which keeps every read
 *   deterministic and recorded.
 *
 * Exports: MAX_READ_ROUNDS, runReads().
 * Depends on: @forge/core (ReadRequest, RepoReader), @forge/tools (admitDirectorRead),
 *   types/card-planning. Reads through the repo reader port.
 */

import { admitDirectorRead } from '@forge/tools';
import type { ReadRequest } from '@forge/core';
import type { PlanCtx, ReadBudget, ReadResult } from '#/types/card-planning.types.js';

/** A step may ask for reads this many times; the call after the last round must answer. */
export const MAX_READ_ROUNDS = 2;

const GREP_MAX_HITS = 50;
const GLOB_MAX_PATHS = 200;
const FILE_MAX_BYTES = 100_000;

const refuse = (request: ReadRequest, error: string): ReadResult => ({
  request,
  ok: false,
  error,
});

async function readOne(
  pc: PlanCtx,
  root: string,
  request: ReadRequest,
  budget: ReadBudget,
): Promise<ReadResult> {
  const reader = pc.ctx.deps.repoReader;
  if (request.op === 'read') {
    const allowance = Math.min(budget.bytesLeft, FILE_MAX_BYTES);
    if (budget.filesLeft <= 0 || allowance <= 0) {
      return refuse(request, 'read cap reached for this step');
    }

    const file = await reader.readAtHead(root, request.path, allowance);
    budget.filesLeft -= 1;
    budget.bytesLeft -= Math.min(file.bytes, allowance);
    if (!budget.filesRead.some((f) => f.path === file.path)) {
      budget.filesRead.push({ path: file.path, bytes: file.bytes });
    }

    return { request, ok: true, text: file.content, truncated: file.truncated };
  }

  if (request.op === 'grep') {
    const hits = await reader.grepAtHead(
      root,
      request.pattern,
      request.glob,
      GREP_MAX_HITS,
    );

    const text = hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join('\n');
    const clipped = text.slice(0, Math.max(0, budget.bytesLeft));
    budget.bytesLeft -= clipped.length;

    return { request, ok: true, text: clipped, truncated: clipped.length < text.length };
  }

  const paths = await reader.listTracked(root, request.pattern);

  return {
    request,
    ok: true,
    text: paths.slice(0, GLOB_MAX_PATHS).join('\n'),
    truncated: paths.length > GLOB_MAX_PATHS,
  };
}

/** Runs the requests in order; each one is judged by `admit()` first and a failure becomes a result, not a throw. */
export async function runReads(
  pc: PlanCtx,
  requests: readonly ReadRequest[],
  budget: ReadBudget,
): Promise<ReadResult[]> {
  const out: ReadResult[] = [];
  for (const request of requests) {
    if (pc.root === null) {
      out.push(refuse(request, 'this project has no local folder to read'));
      continue;
    }

    const verdict = admitDirectorRead(request, pc.root);
    if (verdict.decision !== 'allow') {
      out.push(refuse(request, `denied: ${verdict.reason}`));
      continue;
    }

    try {
      out.push(await readOne(pc, pc.root, request, budget));
    } catch (e) {
      out.push(refuse(request, e instanceof Error ? e.message : String(e)));
    }
  }

  return out;
}
