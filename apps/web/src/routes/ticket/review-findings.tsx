/**
 * ReviewFindings: what the independent checks found, in front of the owner on the Review tab.
 *
 * Why: when a ticket reaches the owner for review, the owner is the last check, and the checks
 *   before them (the reviewer, the critic, a script gate) have already said what they saw: how
 *   many findings and how serious, and their own summary. A ticket that went back for rework
 *   shows why. Making the owner open a chip on the strip to learn that hides the one thing that
 *   decides whether to approve, so the Review tab lists each check that reported, with its
 *   counts by severity, its words and each finding itself (severity, `file:line`, what is wrong and the
 *   evidence), so the owner can open the file instead of trusting a count. The Director's check
 *   against the plan reports the same way. Nothing is shown for a ticket whose pipeline has no
 *   reporting check (Express), and the full detail of any stage stays one click away on the strip.
 *
 * Exports: ReviewFindings.
 * Depends on: api/use-ticket-pipeline, components/ticket/findings-list, domain/stage-view-copy,
 *   schemas/pipelines.
 */

import { useTicketPipeline } from '#/api/use-ticket-pipeline.js';
import { FindingsList } from '#/components/ticket/findings-list.js';
import { STATUS_VIEW, countsLine, reworkBadge } from '#/domain/stage-view-copy.js';
import type { StageView } from '#/schemas/pipelines.js';

function reporters(stages: readonly StageView[]): StageView[] {
  return stages.flatMap((s) =>
    s.members
      ? reporters(s.members)
      : s.counts !== undefined || s.check !== undefined
        ? [s]
        : [],
  );
}

export function ReviewFindings(props: { ticketId: string }) {
  const query = useTicketPipeline(props.ticketId);
  const pipeline = query.data;

  if (!pipeline) {
    return null;
  }

  const rows = reporters(pipeline.stages);
  const badge = reworkBadge(pipeline.rework);

  if (rows.length === 0 && badge === null) {
    return null;
  }

  return (
    <section aria-labelledby="review-findings-heading" className="grid gap-3">
      <h2 id="review-findings-heading" className="text-base font-semibold">
        What the checks found
      </h2>
      {badge ? (
        <p className="text-sm text-muted">
          {`This ticket went back to its writer for rework (${badge.toLowerCase()}) before reaching you.`}
        </p>
      ) : null}
      <ul className="grid gap-2">
        {rows.map((row) => {
          const serious =
            row.counts !== undefined && (row.counts.critical > 0 || row.counts.high > 0);

          return (
            <li
              key={row.id}
              className={`grid gap-1 rounded-lg border p-3 text-sm ${
                serious ? 'border-danger bg-danger-soft' : 'border-line bg-surface'
              }`}
            >
              <p className="font-medium">
                {row.label}
                {row.agent ? (
                  <span className="font-normal text-muted">{` · ${row.agent.name}`}</span>
                ) : null}
                <span className="font-normal text-muted">{` · ${STATUS_VIEW[row.status].label}`}</span>
              </p>
              {row.counts === undefined ? null : (
                <p className={serious ? 'font-medium text-danger' : 'text-muted'}>
                  {countsLine(row.counts)}
                </p>
              )}
              {row.summary ? <p className="max-w-prose">{row.summary}</p> : null}
              <FindingsList
                findings={row.findings ?? row.check?.findings ?? []}
                label={`Findings from ${row.label}`}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
