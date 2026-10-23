/**
 * EscalationWorktreeSetup: a setup step failed while Forge was getting a ticket's workspace ready.
 *
 * Why: before a Worker starts, Forge installs the project's packages in a fresh copy of it
 *   (d-0180). When that stops, no Worker started and nothing was spent, and only the owner can
 *   fix it: the tool may be missing from this computer, the step may need a different command, or
 *   the ticket may not need packages at all. The card says that in plain words, names the step
 *   and shows its exact command (whatever the project's language uses, d-0176), gives one hint
 *   line (tool missing, ran out of time, or read the output), and keeps the last lines the step
 *   printed one click away, as plain text, because that is what the owner needs to diagnose it.
 *   Four ways out: Try again, Edit setup steps (the settings link, which resumes the ticket by
 *   itself once saved), Start without setup (asks first: the checks that need the packages will
 *   likely fail) and Cancel ticket. Only the actions the server offered are drawn.
 *
 * Exports: EscalationWorktreeSetup.
 * Depends on: react, react-router, components/escalation/{escalation-confirmations, escalation-setup},
 *   components/ui/{button, confirm-dialog}, domain/setup-failure-copy, schemas/escalation (types),
 *   types/escalation-ui.types.
 */

import { ChevronDown, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CancelConfirm } from '#/components/escalation/escalation-confirmations.js';
import { safeHref } from '#/components/escalation/escalation-setup.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import {
  SETUP_TAIL_LINES,
  SKIP_SETUP_CONFIRM,
  setupFailureHint,
  setupFailureLead,
  tailLinesOf,
} from '#/domain/setup-failure-copy.js';
import type { EscalationAction } from '#/schemas/escalation.js';
import type {
  EscalationControls,
  WorktreeSetupCause,
} from '#/types/escalation-ui.types.js';

export function EscalationWorktreeSetup(props: {
  ticketId: string;
  cause: WorktreeSetupCause;
  fixHref: string;
  actions: readonly EscalationAction[];
  controls: EscalationControls;
}) {
  const { cause, controls } = props;
  const [tailOpen, setTailOpen] = useState(false);
  const [dialog, setDialog] = useState<'skip' | 'cancel' | null>(null);
  const lead = setupFailureLead(cause);
  const tail = tailLinesOf(cause.tail);
  const busy = controls.pending !== null;
  const spinner = (action: EscalationAction) =>
    controls.pending === action ? ('loading' as const) : ('idle' as const);

  const open = (which: 'skip' | 'cancel'): void => {
    controls.reset();
    setDialog(which);
  };

  const close = (): void => {
    controls.reset();
    setDialog(null);
  };

  return (
    <div className="grid min-w-0 gap-3">
      <p className="min-w-0 break-words text-base">
        {lead.before} <span className="font-semibold">{cause.step}</span> (
        <code className="break-all font-data text-sm">{cause.command}</code>) {lead.after}
      </p>
      <p className="min-w-0 break-words text-sm">{setupFailureHint(cause)}</p>

      <div className="grid gap-1">
        <button
          type="button"
          aria-expanded={tailOpen}
          aria-controls="setup-tail"
          onClick={() => setTailOpen((value) => !value)}
          className="inline-flex min-h-9 items-center gap-1 justify-self-start rounded-lg px-2 text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
        >
          What it printed (last {SETUP_TAIL_LINES} lines)
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform duration-150 ${tailOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {tailOpen ? (
          <pre
            id="setup-tail"
            aria-label="What the step printed"
            className="max-h-72 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-hover p-2 font-data text-xs"
          >
            {tail.length === 0 ? 'It printed nothing.' : tail.join('\n')}
          </pre>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {props.actions.includes('retry') ? (
          <Button
            variant="primary"
            data-dock-option=""
            disabled={busy && controls.pending !== 'retry'}
            status={spinner('retry')}
            onClick={() => controls.act({ action: 'retry' })}
          >
            Try again
          </Button>
        ) : null}
        <Link
          to={safeHref(props.fixHref)}
          className="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg transition-[transform,background-color] duration-150 hover:bg-hover active:translate-y-px"
        >
          <Settings aria-hidden="true" className="size-4" />
          Edit setup steps
        </Link>
        {props.actions.includes('skip_setup') ? (
          <Button
            variant="quiet"
            data-dock-option=""
            disabled={busy && controls.pending !== 'skip_setup'}
            status={spinner('skip_setup')}
            onClick={() => open('skip')}
          >
            Start without setup
          </Button>
        ) : null}
        {props.actions.includes('cancel') ? (
          <Button
            variant="danger"
            data-dock-option=""
            disabled={busy && controls.pending !== 'cancel'}
            onClick={() => open('cancel')}
          >
            Cancel ticket
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        If you save new setup steps, the ticket tries again by itself.
      </p>

      <ConfirmDialog
        open={dialog === 'skip'}
        onOpenChange={(next) => (next ? setDialog('skip') : close())}
        title="Start without setup?"
        description={SKIP_SETUP_CONFIRM}
        confirmLabel="Start without setup"
        onConfirm={() => controls.act({ action: 'skip_setup' }, () => setDialog(null))}
      />
      <CancelConfirm
        open={dialog === 'cancel'}
        onOpenChange={(next) => (next ? setDialog('cancel') : close())}
        controls={controls}
        ticketId={props.ticketId}
      />
    </div>
  );
}
