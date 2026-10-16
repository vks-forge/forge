/**
 * ColumnShell and ColumnScroller: the frame every Board column (Cards or Tickets) sits in.
 *
 * Why: both views answer the same questions in the same six-column layout ("what needs me,
 *   what is moving, what is finished"), so a column's header, count, empty state and the
 *   sideways scroller around them must look and behave identically. The Needs you column is
 *   the only one that tints and outlines itself, and only while something is waiting there, so
 *   amber keeps its meaning. Counts are words for a screen reader ("3 cards"). The scroller is
 *   the only thing that scrolls sideways: the page itself never does, at any width.
 *
 * Exports: ColumnShell, ColumnScroller, TONE_DOT.
 * Depends on: react, types/board.types.
 */

import type { ReactNode } from 'react';
import type { ColumnTone } from '#/types/board.types.js';

export const TONE_DOT: Readonly<Record<ColumnTone, string>> = {
  neutral: 'bg-muted',
  signal: 'bg-signal',
  attn: 'bg-attn',
  good: 'bg-good',
  muted: 'bg-faint',
};

export function ColumnShell(props: {
  headingId: string;
  title: string;
  hint: string;
  tone: ColumnTone;
  count: number;
  /** Plural noun for the count, such as "cards". */
  noun: string;
  /** Why the column is empty: a filter hides items, or there are simply none. */
  filtered: boolean;
  children: ReactNode;
}) {
  const { tone, count, noun } = props;
  const lit = tone === 'attn' && count > 0;

  return (
    <section
      aria-labelledby={props.headingId}
      className={`flex w-[82vw] max-w-72 shrink-0 snap-start flex-col gap-3 rounded-2xl border p-3 md:w-auto md:min-w-56 md:max-w-none md:flex-1 ${
        lit ? 'border-attn/60 bg-attn-soft/40' : 'border-line bg-rail'
      }`}
    >
      <header className="grid gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
          />
          <h2 id={props.headingId} className="text-sm font-semibold">
            {props.title}
          </h2>
          <span
            className={`ml-auto min-w-6 rounded-md px-1.5 text-center font-data text-xs ${
              lit ? 'bg-attn-soft font-medium text-fg' : 'bg-hover text-muted'
            }`}
            aria-label={`${count} ${noun}`}
          >
            {count}
          </span>
        </div>
        <p className="pl-4 text-xs text-muted">{props.hint}</p>
      </header>
      {count === 0 ? (
        <div className="grid justify-items-center gap-0.5 rounded-xl border border-dashed border-line px-3 py-6 text-center">
          <p className="text-sm text-muted">
            {props.filtered ? `No ${noun} match the filter.` : 'Nothing here.'}
          </p>
          {tone === 'attn' && !props.filtered ? (
            <p className="text-xs text-faint">You are all caught up.</p>
          ) : null}
        </div>
      ) : (
        props.children
      )}
    </section>
  );
}

export function ColumnScroller(props: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-3 motion-safe:scroll-smooth md:-mx-8 md:snap-none md:scroll-px-8 md:px-8">
      {props.children}
    </div>
  );
}
