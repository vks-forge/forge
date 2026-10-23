/**
 * StageChip: one stage of the ticket's pipeline as a button with its status in words.
 *
 * Why: the owner reads the strip to learn where a ticket is and why it waits. Every chip says its
 *   status as a word and an icon (never colour alone); the sign-off chip says who signed ("Signed
 *   by the Director", "Waiting for you"); a Director check that had no plan says so; a stage the
 *   owner overruled carries an "Overruled by you" badge so a merge-anyway is never invisible; a
 *   routing rule's stage and a stage with a warning (a critic on the Worker's own model family)
 *   say so too. A stage the Director added, moved or swapped carries a "Director" badge (the reason is in
 *   its detail), and one that ran on a fallback or a substitute says so in its sub-line. A writer-group member also shows the folders it may write, so side-by-side
 *   writers are told apart by what they own. The chip is the control that opens the detail.
 *
 *   On a finished (done or cancelled) ticket the chips are history: muted, and the word is what the
 *   stage last was ("Last check: did not pass (round 4)"), never a present-tense "Failed".
 *
 * Exports: StageChip.
 * Depends on: lucide-react, domain/director-change-copy, domain/stage-view-copy, domain/ticket-status-copy, schemas/pipelines (type).
 */

import {
  Check,
  CheckCheck,
  Circle,
  CircleAlert,
  CircleX,
  LoaderCircle,
  Minus,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { changeBadge, ranOnShort } from '#/domain/director-change-copy.js';
import { stageWords } from '#/domain/stage-view-copy.js';
import { stageHistoryWords } from '#/domain/ticket-status-copy.js';
import type { StageView } from '#/schemas/pipelines.js';

const ICON: Readonly<Record<StageView['status'], LucideIcon>> = {
  pending: Circle,
  running: LoaderCircle,
  passed: Check,
  failed: CircleX,
  error: CircleAlert,
  waiting: UserRound,
  skipped: Minus,
  adopted: CheckCheck,
};

const TONE = {
  good: 'border-good text-good',
  danger: 'border-danger bg-danger-soft text-fg',
  attn: 'border-attn bg-attn-soft text-fg',
  signal: 'border-signal text-fg',
  quiet: 'border-line text-muted',
} as const;

export function StageChip(props: {
  stage: StageView;
  selected: boolean;
  panelId: string;
  addedByRule: boolean;
  /** The ticket is done or cancelled: the chip is history, quieter, and says what it last was. */
  finished?: boolean;
  onToggle: () => void;
}) {
  const { stage } = props;
  const words = stageWords(stage);
  const tone = props.finished === true ? 'quiet' : words.tone;
  const Icon = ICON[stage.status];

  return (
    <button
      type="button"
      aria-expanded={props.selected}
      aria-controls={props.selected ? props.panelId : undefined}
      onClick={props.onToggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1 text-left text-sm transition-colors hover:bg-hover ${TONE[tone]} ${
        props.selected ? 'ring-2 ring-signal' : ''
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`size-4 shrink-0 ${
          stage.status === 'running' ? 'motion-safe:animate-spin' : ''
        }`}
      />
      <span className="grid min-w-0">
        <span className="font-medium">{stage.label}</span>
        <span className="text-xs">
          {props.finished === true && stage.kind !== 'sign_off'
            ? stageHistoryWords(stage)
            : words.label}
          {props.finished !== true && stage.cycle > 0 && stage.status !== 'pending'
            ? `, round ${stage.cycle + 1}`
            : ''}
          {props.addedByRule ? ', added by rule' : ''}
          {stage.override === undefined ? '' : ', overruled by you'}
          {ranOnShort(stage.ran_on)}
          {stage.warnings.length > 0 ? ', has a note' : ''}
        </span>
        {stage.changed === undefined ? null : (
          <span className="w-fit rounded border border-signal px-1 text-xs font-medium text-fg">
            {changeBadge(stage.changed)}
          </span>
        )}
        {stage.scope === undefined || stage.scope.length === 0 ? null : (
          <span className="break-all font-data text-xs text-muted">
            {stage.scope.join(', ')}
          </span>
        )}
      </span>
    </button>
  );
}
