/**
 * StageDetail: what one stage of a ticket did: who ran it, when, what it found and what it saw.
 *
 * Why: the strip says a stage failed or waits; the owner needs to know why before deciding what
 *   to do. This panel answers: which agent ran (with a link to that run's thread), when, in
 *   which round, the reviewer's summary and its findings counted by severity, and the artifacts
 *   the stage was shown or produced (the diff, the plan, the gate report, earlier findings).
 *   An artifact loads only when opened, since a diff can be large, and is shown in a fixed-width
 *   block so a diff reads as one. The Worker's own account is labelled as such and the panel says
 *   a reviewer never saw it, because the owner is the only reader allowed both stories. A group
 *   shows each member as its own block. Individual findings (file, line, evidence) are not in the
 *   stage view the server sends, so what is shown is the reviewer's own summary, the counts, and
 *   the "Earlier findings" artifact when one exists.
 *
 * Exports: StageDetail.
 * Depends on: react, react-router, lucide-react, api/use-ticket-pipeline, components/ui/*,
 *   domain/{format-time,stage-view-copy,ticket-paths}, schemas/pipelines.
 */

import { Link } from 'react-router';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useStageArtifact } from '#/api/use-ticket-pipeline.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { formatWhen } from '#/domain/format-time.js';
import {
  NARRATIVE_NOTE,
  STATUS_VIEW,
  artifactLabel,
  countsLine,
} from '#/domain/stage-view-copy.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import type { StageView } from '#/schemas/pipelines.js';

function ArtifactBody(props: {
  ticketId: string;
  artifact: StageView['artifacts'][number];
}) {
  const { ticketId, artifact } = props;
  const [open, setOpen] = useState(false);
  const query = useStageArtifact(ticketId, artifact.id, open);
  const label = artifactLabel(artifact.kind);
  const bodyId = `artifact-${artifact.id}`;

  return (
    <li className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="min-h-9 w-fit rounded-lg border border-line px-2.5 text-sm font-medium hover:bg-hover"
      >
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open ? (
        <div id={bodyId} className="grid gap-2">
          {artifact.kind === 'narrative' ? (
            <p className="text-xs text-muted">{NARRATIVE_NOTE}</p>
          ) : null}
          {query.isPending ? (
            <StatePanel kind="loading" label={`Loading ${label}`} />
          ) : query.isError ? (
            <StatePanel
              kind="error"
              title="Could not load this"
              detail={describeError(query.error).detail}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : (
            <>
              <pre
                tabIndex={0}
                aria-label={label}
                className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-hover p-3 font-data text-xs"
              >
                {query.data.content}
              </pre>
              {query.data.truncated ? (
                <p className="text-xs text-muted">
                  This is the start of a longer text; the rest was cut when it was stored.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Block(props: {
  slug: string;
  ticketId: string;
  view: StageView;
  heading: string;
}) {
  const { view } = props;
  const status = STATUS_VIEW[view.status];
  const counts = countsLine(view.counts);

  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-semibold">{props.heading}</h4>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted">Status</dt>
        <dd>{status.label}</dd>
        {view.agent ? (
          <>
            <dt className="text-muted">Agent</dt>
            <dd>{view.agent.name}</dd>
          </>
        ) : null}
        {view.status === 'pending' ? null : (
          <>
            <dt className="text-muted">Round</dt>
            <dd>{view.cycle + 1}</dd>
          </>
        )}
        {view.started_at ? (
          <>
            <dt className="text-muted">Started</dt>
            <dd>{formatWhen(view.started_at)}</dd>
          </>
        ) : null}
        {view.ended_at ? (
          <>
            <dt className="text-muted">Finished</dt>
            <dd>{formatWhen(view.ended_at)}</dd>
          </>
        ) : null}
        {view.run_id ? (
          <>
            <dt className="text-muted">Run</dt>
            <dd>
              <Link
                to={ticketPath(props.slug, props.ticketId, 'conversation', view.run_id)}
                className="font-medium text-signal underline-offset-2 hover:underline"
              >
                {`Open the run of ${view.label}`}
              </Link>
            </dd>
          </>
        ) : null}
        {counts ? (
          <>
            <dt className="text-muted">Findings</dt>
            <dd
              className={
                view.counts && (view.counts.critical > 0 || view.counts.high > 0)
                  ? 'font-medium text-danger'
                  : ''
              }
            >
              {counts}
            </dd>
          </>
        ) : null}
      </dl>
      {view.summary ? <p className="max-w-prose text-sm">{view.summary}</p> : null}
      {view.artifacts.length > 0 ? (
        <ul aria-label={`What ${view.label} saw and made`} className="grid gap-2">
          {view.artifacts.map((artifact) => (
            <ArtifactBody
              key={artifact.id}
              ticketId={props.ticketId}
              artifact={artifact}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StageDetail(props: {
  slug: string;
  ticketId: string;
  view: StageView;
  /** Set when a routing rule added this stage. */
  addedBy: string | undefined;
  id: string;
}) {
  const { view } = props;

  return (
    <section
      id={props.id}
      aria-label={`Details of ${view.label}`}
      className="grid max-h-[40dvh] gap-4 overflow-auto rounded-xl border border-line bg-surface p-4"
    >
      {props.addedBy ? (
        <p className="text-xs text-muted">{`Added by the routing rule “${props.addedBy}”.`}</p>
      ) : null}
      <Block
        slug={props.slug}
        ticketId={props.ticketId}
        // A group's artifact list is its members' together; they are shown under each member.
        view={view.members ? { ...view, artifacts: [] } : view}
        heading={view.label}
      />
      {view.members?.map((member) => (
        <div key={member.id} className="grid gap-2 border-t border-line pt-3">
          <Block
            slug={props.slug}
            ticketId={props.ticketId}
            view={member}
            heading={member.label}
          />
        </div>
      ))}
    </section>
  );
}
