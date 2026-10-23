/**
 * RunDrawer: everything about one run, opened from the Runs list without losing the list.
 *
 * Why: the list row says a run failed or cost more than expected; the person debugging needs
 *   the rest: which gates ran and what they decided, where the Worker worked (its folder),
 *   which tool session it holds, how many tokens each model used, and a way back to the
 *   ticket it serves. The drawer reads `GET /runs/:id`, refreshes while the run is live, and
 *   has its own loading and error states so a failed detail call never blanks the list.
 *   The pages the run read are listed with links out (components/research/run-sources).
 *   Tokens are shown per model and never priced: Forge has no price table, so a dollar figure
 *   per model would be invented.
 *
 * Exports: RunDrawer.
 * Depends on: react-router, components/ui/{side-drawer,whats-this}, api/use-runs, domain/*.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { GateResult, RunDetail } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useRunDetail } from '#/api/use-runs.js';
import { RunSources } from '#/components/research/run-sources.js';
import { RunStatusPill } from '#/components/status/run-status-pill.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { SideDrawer } from '#/components/ui/side-drawer.js';
import { WhatsThis } from '#/components/ui/whats-this.js';
import { tokenLine } from '#/domain/cost-view.js';
import { formatWhen } from '#/domain/format-time.js';
import { harnessName } from '#/domain/harness-labels.js';
import { LANE_LABEL } from '#/domain/pipeline-copy.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import type { TermId } from '#/types/plain-words.types.js';
import { formatDuration, formatUsd } from '#/domain/stats-format.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { ShieldCheck } from 'lucide-react';

const GATE_WORD: Readonly<Record<GateResult['status'], string>> = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  error: 'Errored',
};

function Fact(props: { label: string; help?: TermId; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {props.label}
        {props.help ? <WhatsThis term={props.help} /> : null}
      </dt>
      <dd className="min-w-0 break-words font-data text-sm">{props.children}</dd>
    </div>
  );
}

function Body(props: { run: RunDetail; slug: string }) {
  const { run } = props;
  const models = Object.entries(run.tokens_by_model ?? {});

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <RunStatusPill run={run} />
        <Link
          to={ticketPath(props.slug, run.ticket_id)}
          className="text-sm font-medium text-signal underline-offset-2 hover:underline"
        >
          Open ticket {run.ticket_id}
        </Link>
      </div>
      {run.ticket_title ? <p className="text-sm">{run.ticket_title}</p> : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="AI coding tool" help="tool">
          {harnessName(run.harness)}
        </Fact>
        <Fact label="Care level" help="care">
          {LANE_LABEL[run.lane]}
        </Fact>
        <Fact label="Started">{formatWhen(run.started_at)}</Fact>
        <Fact label="Ended">{run.ended_at ? formatWhen(run.ended_at) : 'Not ended'}</Fact>
        <Fact label="Duration">{formatDuration(run.duration_ms)}</Fact>
        <Fact label="Cost">
          {run.cost_usd === undefined ? 'Not reported' : formatUsd(run.cost_usd)}
        </Fact>
        <Fact label="Attempt" help="attempt">
          {run.generation}
        </Fact>
        <Fact label="Connector version" help="connector">
          {run.driver_version}
        </Fact>
        {run.error_family ? <Fact label="Error">{run.error_family}</Fact> : null}
        {run.retry_of ? <Fact label="Retry of">{run.retry_of}</Fact> : null}
      </dl>

      <dl className="grid gap-3">
        <Fact label="Working folder">{run.cwd}</Fact>
        <Fact label="Tool session" help="tool_session">
          {run.session_ref ?? 'None recorded'}
        </Fact>
      </dl>

      <section aria-labelledby="run-gates" className="grid gap-2">
        <h3 id="run-gates" className="text-sm font-semibold">
          Gates
        </h3>
        {run.gates.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={ShieldCheck}
            title="No gate has judged this run yet"
          />
        ) : (
          <ul className="grid">
            {run.gates.map((gate) => (
              <li
                key={gate.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0"
              >
                <span className="font-data">{gate.gate}</span>
                <span
                  className={
                    gate.status === 'failed' || gate.status === 'error'
                      ? 'text-danger'
                      : ''
                  }
                >
                  {GATE_WORD[gate.status]}
                </span>
                <span className="font-data text-xs text-muted">
                  {gate.head_sha ? gate.head_sha.slice(0, 7) : 'no sha'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="run-sources" className="grid gap-2">
        <h3 id="run-sources" className="text-sm font-semibold">
          Sources this run read
        </h3>
        <RunSources runId={run.id} />
      </section>

      <section aria-labelledby="run-tokens" className="grid gap-2">
        <h3 id="run-tokens" className="text-sm font-semibold">
          Tokens by model
        </h3>
        {models.length === 0 ? (
          <p className="text-sm text-muted">The harness reported no token usage.</p>
        ) : (
          <ul className="grid">
            {models.map(([model, t]) => (
              <li
                key={model}
                className="grid gap-0.5 border-b border-line py-2 last:border-b-0"
              >
                <span className="break-words font-data text-sm">{model}</span>
                <span className="font-data text-xs text-muted">{tokenLine(t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function RunDrawer(props: {
  slug: string;
  id: string | null;
  onClose: () => void;
}) {
  const detail = useRunDetail(props.id);

  return (
    <SideDrawer
      open={props.id !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
      title="Run details"
      {...(props.id ? { eyebrow: props.id } : {})}
    >
      {detail.isPending ? (
        <StatePanel kind="loading" label="Loading run" />
      ) : detail.isError ? (
        <StatePanel
          kind="error"
          title={describeError(detail.error).title}
          detail={describeError(detail.error).detail}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      ) : (
        <Body run={detail.data} slug={props.slug} />
      )}
    </SideDrawer>
  );
}
