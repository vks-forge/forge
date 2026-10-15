/**
 * RunStatusPill: a run's status as an icon, a word and a tone.
 *
 * Why: a run is "working", "parked until the quota resets", "done" or "went wrong", and the
 *   reader should see which without learning eleven status codes. The word and icon carry the
 *   meaning, the tone only reinforces it (never colour alone). Amber is reserved for what
 *   needs the user, so a parked or interrupted run uses it; a working run uses the signal
 *   colour and a spinning icon that stops under reduced motion.
 *
 * Exports: RunStatusPill.
 * Depends on: lucide-react, domain/run-format, @forge/core (type).
 */

import { Check, CircleAlert, Hourglass, LoaderCircle, Minus } from 'lucide-react';
import type { RunSummary } from '@forge/core';
import { runStatusView } from '#/domain/run-format.js';
import type { RunTone } from '#/types/work-ui.types.js';

const TONE: Readonly<Record<RunTone, { Icon: typeof Check; cls: string }>> = {
  working: { Icon: LoaderCircle, cls: 'bg-signal-soft text-signal' },
  parked: { Icon: Hourglass, cls: 'bg-attn-soft text-fg' },
  good: { Icon: Check, cls: 'bg-hover text-good' },
  bad: { Icon: CircleAlert, cls: 'bg-danger-soft text-danger' },
  neutral: { Icon: Minus, cls: 'bg-hover text-muted' },
};

export function RunStatusPill(props: {
  run: Pick<RunSummary, 'status' | 'paused_harness'>;
}) {
  const { label, tone } = runStatusView(props.run);
  const { Icon, cls } = TONE[tone];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon
        aria-hidden="true"
        className={`size-3 ${tone === 'working' ? 'motion-safe:animate-spin' : ''}`}
      />
      {label}
    </span>
  );
}
