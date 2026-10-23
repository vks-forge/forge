/**
 * StatusPill: the one status of a card or ticket in the header, said once.
 *
 * Why: the old header said where a card stood in five places (a column chip, a phase line, a
 *   banner, a tab dot, a step line). One pill carries it: a state word and, from a medium
 *   screen up, the phase that goes with it ("Needs you · Plan v2 ready"). Amber and an icon
 *   mark only "waits on you", so amber keeps its meaning; every other state is neutral, and the
 *   word always comes with the colour, never the colour alone.
 *
 * Exports: StatusPill.
 * Depends on: react, lucide-react.
 */

import { CircleAlert } from 'lucide-react';

export function StatusPill(props: {
  tone: 'attn' | 'neutral';
  label: string;
  /** Said after the label from a medium screen up; dropped on a phone to keep the row one line. */
  detail?: string | null | undefined;
}) {
  const attn = props.tone === 'attn';

  return (
    <span
      className={`inline-flex min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        attn ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
      }`}
    >
      {attn ? (
        <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-attn" />
      ) : null}
      <span className="truncate">{props.label}</span>
      {props.detail ? (
        <span className="hidden truncate font-normal text-muted md:inline">
          · {props.detail}
        </span>
      ) : null}
    </span>
  );
}
