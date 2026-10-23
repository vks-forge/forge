/**
 * HistoryRow: one line of a ticket's or card's history.
 *
 * Why: the owner reads History to learn what happened and why, so each row leads with the
 *   sentence the server wrote, then the facts around it: who did it (an icon and a word, never
 *   an icon alone), when (relative, with the exact time on hover), the states it moved between
 *   as the same chips the Board uses, how long the work waited, and a way into the run,
 *   question, review or ticket it came from. A long detail (a review summary, an answer) is
 *   folded behind "Show more" so one verbose entry does not push the story off the screen.
 *
 * Exports: HistoryRow.
 * Depends on: react, react-router, lucide-react, @forge/core (types), components/ticket/status-chips,
 *   domain/history-view, domain/relative-time, types/history-view.types.
 */

import type { HistoryActor, HistoryEntry } from '@forge/core';
import { ArrowRight, Cog, Compass, Hammer, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { StateChip } from '#/components/ticket/status-chips.js';
import { actorLabel, isLongDetail, waitedWords } from '#/domain/history-view.js';
import { timeAgo } from '#/domain/relative-time.js';
import type { HistoryLink } from '#/types/history-view.types.js';

const ACTOR_ICON: Readonly<Record<HistoryActor['type'], LucideIcon>> = {
  owner: User,
  director: Compass,
  engine: Cog,
  worker: Hammer,
};

function StateMove(props: { from: HistoryEntry['from']; to: HistoryEntry['to'] }) {
  const { from, to } = props;
  if (from === undefined && to === undefined) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {from === undefined ? null : (
        <>
          <span className="sr-only">From</span>
          <StateChip state={from} needsYou={false} />
        </>
      )}
      {from !== undefined && to !== undefined ? (
        <ArrowRight aria-hidden="true" className="size-3.5 text-faint" />
      ) : null}
      {to === undefined ? null : (
        <>
          <span className="sr-only">to</span>
          <StateChip state={to} />
        </>
      )}
    </span>
  );
}

function Detail(props: { text: string }) {
  const id = useId();
  const long = isLongDetail(props.text);
  const [open, setOpen] = useState(false);

  return (
    <div className="grid justify-items-start gap-0.5">
      <p
        id={id}
        className={`whitespace-pre-line text-sm text-muted ${long && !open ? 'line-clamp-3' : ''}`}
      >
        {props.text}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="min-h-9 rounded-md px-1 text-xs font-medium text-signal hover:bg-hover"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

export function HistoryRow(props: {
  entry: HistoryEntry;
  now: number;
  link: HistoryLink | undefined;
  /** The last row of the list draws no connecting line below it. */
  last: boolean;
}) {
  const { entry, now, link } = props;
  const Icon = ACTOR_ICON[entry.actor.type];
  const waited = waitedWords(entry.waited_ms);
  const exact = new Date(entry.at).toLocaleString();

  return (
    <li className="relative grid gap-1 pb-5 pl-9 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 grid size-6 place-items-center rounded-full bg-hover text-muted ring-1 ring-line"
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
      {props.last ? null : (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-3 top-7 w-px bg-line"
        />
      )}
      <p className="text-sm font-medium">{entry.title}</p>
      <StateMove from={entry.from} to={entry.to} />
      {entry.detail === undefined ? null : <Detail text={entry.detail} />}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <span>{actorLabel(entry.actor)}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={entry.at} title={exact}>
          {timeAgo(entry.at, now)}
        </time>
        {waited === undefined ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span>{waited}</span>
          </>
        )}
        {link === undefined ? null : (
          <>
            <span aria-hidden="true">·</span>
            <Link
              to={link.to}
              className="rounded-sm font-medium text-signal underline-offset-2 hover:underline"
            >
              {link.label}
            </Link>
          </>
        )}
      </p>
    </li>
  );
}
