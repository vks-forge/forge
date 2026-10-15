/**
 * CompatPanel: is the installed build of the harness one Forge can safely run Workers on?
 *
 * Why: Forge polices Workers through hooks and event ordering that a harness update can break
 *   without notice, so a build Forge has not verified is held back (and its harness paused)
 *   until a check passes. The check drives the real harness through a scripted session and
 *   takes about a minute, which is long enough that a screen with no sign of life reads as
 *   hung. This panel shows the build and verdict, starts a check on demand, shows it running
 *   (the server's job state is polled until it ends), and then lists each check in plain
 *   words, so a failure says what was seen and not just "failed".
 *
 * Exports: CompatPanel.
 * Depends on: react, motion/react, lucide-react, @tanstack/react-query, api/api-provider,
 *   api/describe-error, api/use-settings-data, components/settings/*, components/ui/button,
 *   domain/format-time, state/use-submit.
 */

import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, MinusCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { describeError } from '#/api/describe-error.js';
import {
  compatKey,
  HARNESSES_KEY,
  toolsKey,
  useCompat,
} from '#/api/use-settings-data.js';
import { Notice } from '#/components/settings/form-field.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { Button } from '#/components/ui/button.js';
import { formatWhen } from '#/domain/format-time.js';
import type { CompatView } from '#/schemas/settings.js';
import { useSubmit } from '#/state/use-submit.js';
import type { PillTone } from '#/types/settings-ui.types.js';

const VERDICT: Readonly<Record<CompatView['compat'], { tone: PillTone; text: string }>> =
  {
    pass: { tone: 'good', text: 'Compatible' },
    fail: { tone: 'bad', text: 'Not compatible' },
    pending: { tone: 'attn', text: 'Check pending' },
    unknown: { tone: 'quiet', text: 'Not checked yet' },
  };

const CHECK_ICON = { pass: Check, fail: CircleAlert, skipped: MinusCircle } as const;

function Progress(props: { build: string | undefined; startedAt: string | undefined }) {
  return (
    <div role="status" className="grid gap-2 text-sm">
      <p>
        Checking {props.build ? `build ${props.build}` : 'the installed build'}. This
        takes about a minute
        {props.startedAt ? `; started ${formatWhen(props.startedAt)}` : ''}. You can leave
        this page; the check keeps running.
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-hover">
        <motion.div
          className="h-full w-1/3 rounded-full bg-signal"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}

export function CompatPanel(props: { id: string }) {
  const { id } = props;
  const api = useForgeApi();
  const queryClient = useQueryClient();
  const compat = useCompat(id, true);
  const start = useSubmit(async () => {
    await api.harnesses.runCompat(id);
    await queryClient.invalidateQueries({ queryKey: compatKey(id) });
  });

  const state = compat.data?.job.state;
  const was = useRef(state);
  useEffect(() => {
    // A finished check can pause or release the harness and change which tools need approval.
    if (was.current === 'running' && state !== 'running') {
      void queryClient.invalidateQueries({ queryKey: HARNESSES_KEY });
      void queryClient.invalidateQueries({ queryKey: toolsKey(id) });
    }

    was.current = state;
  }, [state, queryClient, id]);

  if (compat.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading compatibility"
        className="h-16 animate-pulse rounded-lg bg-hover"
      />
    );
  }

  if (compat.isError) {
    return (
      <Notice tone="error" title={describeError(compat.error).title}>
        {describeError(compat.error).detail}
      </Notice>
    );
  }

  const view = compat.data;
  const running = view.job.state === 'running';
  const verdict = VERDICT[view.compat];
  const report = view.job.report ?? view.report;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusPill tone={verdict.tone}>{verdict.text}</StatusPill>
        <span className="text-sm text-muted">
          Installed build{' '}
          <span className="font-data text-fg">{view.version ?? 'not found'}</span>
          {view.checked_at ? `, checked ${formatWhen(view.checked_at)}` : ''}
        </span>
      </div>
      {running ? (
        <Progress build={view.version ?? undefined} startedAt={view.job.started_at} />
      ) : null}
      {view.job.state === 'failed' ? (
        <Notice tone="error" title="The check could not finish">
          {view.job.error ?? 'The harness could not be driven. Test it above first.'}
        </Notice>
      ) : null}
      {start.status === 'error' ? (
        <Notice tone="error" title="The check did not start">
          {describeError(start.error).detail}
        </Notice>
      ) : null}
      {!running && report ? (
        <div className="grid gap-3">
          <p className="text-sm">{report.summary}</p>
          <ul className="grid gap-1.5">
            {report.checks.map((check) => {
              const Icon = CHECK_ICON[check.status];

              return (
                <li key={check.id} className="flex items-start gap-2 text-sm">
                  <Icon
                    aria-hidden="true"
                    className={`mt-0.5 size-4 shrink-0 ${check.status === 'fail' ? 'text-danger' : check.status === 'pass' ? 'text-good' : 'text-faint'}`}
                  />
                  <span>
                    <span className="sr-only">{check.status}: </span>
                    {check.detail}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div>
        <Button
          status={start.pending || running ? 'loading' : 'idle'}
          onClick={() => void start.run()}
        >
          {running ? 'Checking…' : 'Run compatibility check'}
        </Button>
      </div>
    </div>
  );
}
