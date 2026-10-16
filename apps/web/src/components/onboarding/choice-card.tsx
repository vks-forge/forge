/**
 * ChoiceCard: one option of a radio group, drawn as a card with a title and a sentence.
 *
 * Why: the git step asks real either-or questions (snapshot or init only, repository top or
 *   this subfolder, merge locally or through GitHub) where each answer needs a sentence of
 *   consequence next to it, not a bare label. A native radio inside a label keeps keyboard and
 *   screen-reader behaviour for free; the chosen card is marked by border and tint as well as
 *   the radio dot, and the recommended answer says so in words.
 *
 * Exports: ChoiceCard.
 * Depends on: react.
 */

import type { ReactNode } from 'react';

export function ChoiceCard(props: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  /** Say "Recommended" for the default answer. */
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4 transition-[background-color,border-color] duration-150 hover:border-faint has-[:checked]:border-signal has-[:checked]:bg-signal-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal">
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        onChange={props.onChange}
        className="mt-1 size-4 shrink-0 accent-[var(--signal)]"
      />
      <span className="grid min-w-0 gap-1 text-sm">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {props.title}
          {props.badge ? (
            <span className="rounded-full border border-line px-2 py-0.5 text-[0.68rem] font-medium text-muted">
              {props.badge}
            </span>
          ) : null}
        </span>
        {props.children ? <span className="text-muted">{props.children}</span> : null}
      </span>
    </label>
  );
}
