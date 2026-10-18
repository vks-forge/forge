/**
 * Stage artifacts: what a stage is shown or leaves behind, as typed, capped, hashed text.
 *
 * Why: stages hand each other typed artifacts instead of conversations (d-0070): the ticket, the
 *   plan entry, the diff, the Worker's typed claims, its own account (narrative), the red-proof
 *   test report, findings of earlier rounds and the gate report. A reviewer is given exactly the
 *   kinds its agent lists, and each is stored whole (capped, with a flag when cut) with its
 *   SHA-256, so the owner can open the stage on the ticket page and see what the reviewer read,
 *   and the same bytes can be checked later. This file gathers them from the places they live
 *   (the ticket and its plan entry, the run's events, the worktree diff the caller already read,
 *   earlier stage rows); it writes nothing but the rows it is asked to persist.
 *
 * Exports: ARTIFACT_CAP, makeDraft(), collectArtifacts(), persistArtifacts(), pipelineHasChecks().
 * Depends on: @forge/core (stage and agent types, classifyStage), @forge/tools (sha256Hex), tick/plan-keys,
 *   tick/verify-gates. Reads storage.
 */

import { classifyStage } from '@forge/core';
import type { ArtifactKind, StorageTx, Ticket, TicketPipeline } from '@forge/core';
import { sha256Hex } from '@forge/tools';
import { planEntryOf } from '#/tick/plan-keys.js';
import type { ArtifactDraft, CollectInput } from '#/types/stage-runner.types.js';

/** `stage_artifacts.content` is capped at this many characters. */
export const ARTIFACT_CAP = 200_000;

/** A draft of `kind` from `text`, cut at the cap (and flagged) and hashed as stored. */
export function makeDraft(kind: ArtifactKind, text: string): ArtifactDraft {
  const truncated = text.length > ARTIFACT_CAP;
  const content = truncated ? text.slice(0, ARTIFACT_CAP) : text;

  return { kind, content, truncated, sha256: sha256Hex(content) };
}

/** True when some stage of the pipeline reads artifacts (a check agent or a group): only then are artifacts stored. */
export function pipelineHasChecks(
  snapshot: Pick<TicketPipeline, 'definition' | 'roles'>,
): boolean {
  return snapshot.definition.stages.some(
    (s) => s.kind === 'group' || classifyStage(s, snapshot.roles) === 'check_agent',
  );
}

const finishOf = async (
  tx: StorageTx,
  runId: string,
): Promise<{ summary: string; structured: unknown } | null> => {
  const events = await tx.runEvents.listByRun(runId);
  for (const e of [...events].reverse()) {
    if (e.type === 'finish') {
      return { summary: e.summary, structured: e.structured };
    }
  }

  return null;
};

async function storedText(
  tx: StorageTx,
  ticketId: string,
  kind: ArtifactKind,
): Promise<string | null> {
  const meta = (await tx.stageArtifacts.listByTicket(ticketId)).filter(
    (a) => a.kind === kind,
  );

  const last = meta[meta.length - 1];

  return last
    ? ((await tx.stageArtifacts.get(ticketId, last.id))?.content ?? null)
    : null;
}

async function textOf(
  tx: StorageTx,
  input: CollectInput,
  kind: ArtifactKind,
): Promise<string | null> {
  const { ticket, run } = input;
  switch (kind) {
    case 'ticket':
      return `# ${ticket.title}\n\n${ticket.body}`;
    case 'plan': {
      const found = await planEntryOf(tx, ticket);
      if (!found) {
        return null;
      }

      const { entry } = found;

      return [
        `${entry.title} (${entry.size}, lane ${entry.lane})`,
        entry.body,
        entry.acceptance.length > 0
          ? `Acceptance:\n${entry.acceptance.map((a) => `- ${a}`).join('\n')}`
          : '',
        entry.files.length > 0 ? `Planned files:\n${entry.files.join('\n')}` : '',
      ]
        .filter((p) => p !== '')
        .join('\n\n');
    }

    case 'diff':
      return input.diff === undefined || input.diff === '' ? null : input.diff;
    case 'finish_claims': {
      const finish = await finishOf(tx, run.id);

      return finish ? JSON.stringify(finish.structured ?? { claims: [] }, null, 2) : null;
    }

    case 'narrative':
      return (await finishOf(tx, run.id))?.summary ?? null;
    case 'findings': {
      const rows = (await tx.stageRuns.listByTicket(ticket.id)).filter(
        (r) => r.outcome.review,
      );

      if (rows.length === 0) {
        return null;
      }

      return rows
        .map(
          (r) =>
            `Round ${r.cycle + 1}, ${r.stage_id}: ${r.outcome.review?.verdict} - ${r.outcome.review?.summary}\n` +
            (r.outcome.review?.findings ?? [])
              .map(
                (f) =>
                  `- [${f.severity}] ${f.file ?? ''}${f.line ? `:${f.line}` : ''} ${f.issue}`,
              )
              .join('\n'),
        )
        .join('\n\n');
    }

    case 'test_report':
    case 'gate_report':
    case 'check_report':
      return storedText(tx, ticket.id, kind);
  }
}

/** The drafts for `input.kinds`, in that order; a kind with nothing to show is left out. */
export async function collectArtifacts(
  tx: StorageTx,
  input: CollectInput,
): Promise<ArtifactDraft[]> {
  const out: ArtifactDraft[] = [];
  for (const kind of input.kinds) {
    const text = await textOf(tx, input, kind);
    if (text !== null && text !== '') {
      out.push(makeDraft(kind, text));
    }
  }

  return out;
}

/** Stores `drafts` against stage attempt `stageRunId`. */
export async function persistArtifacts(
  tx: StorageTx,
  ticketId: string,
  stageRunId: number,
  drafts: readonly ArtifactDraft[],
  nowIso: string,
): Promise<void> {
  for (const d of drafts) {
    await tx.stageArtifacts.add({
      ticket_id: ticketId as Ticket['id'],
      stage_run_id: stageRunId,
      kind: d.kind,
      content: d.content,
      truncated: d.truncated,
      sha256: d.sha256,
      created_at: nowIso,
    });
  }
}
