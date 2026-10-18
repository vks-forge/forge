/**
 * ResearchLine: a finished research run as one quiet line in the card's conversation.
 *
 * Why: before it asks or plans, the Director may look facts up on the web, and the owner
 *   should see that it did, how much, and how much of it could not be checked, without the
 *   chat filling with page lists. The line says what the run did ("Researched: 3 searches, 5
 *   pages, 7 facts (2 unverified)") and links to the Evidence tab where every claim and its
 *   quote can be read. When nothing could be looked up, it says "Research could not run", gives
 *   the reason in the server's words and, when settings are the cause, links straight to
 *   Research settings, so the card never stalls on a silent gap. The note and open questions
 *   are model-adjacent text and are drawn as plain text.
 *
 * Exports: ResearchLine.
 * Depends on: react-router, lucide-react, domain/card-paths, domain/nav-entries,
 *   domain/relative-time, types/research-ui.types.
 */

import { Dot } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { cardPath } from '#/domain/card-paths.js';
import { settingsPath } from '#/domain/nav-entries.js';
import { clockTime } from '#/domain/relative-time.js';
import type { ResearchLineView } from '#/types/research-ui.types.js';

const LINK =
  'inline-flex min-h-6 items-center rounded-md px-1 text-signal underline-offset-2 hover:bg-hover hover:underline';

export function ResearchLine(props: {
  research: ResearchLineView;
  slug: string;
  at: string;
}) {
  const { id = '' } = useParams();
  const { research } = props;

  return (
    <div className="grid gap-1 text-xs text-muted">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <Dot aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 break-words">{research.text}</span>
        <Link to={cardPath(props.slug, id, 'evidence')} className={LINK}>
          See the evidence
        </Link>
        {research.settingsHelp ? (
          <Link to={settingsPath('research')} className={LINK}>
            Open Research settings
          </Link>
        ) : null}
        <time dateTime={props.at} className="font-data">
          {clockTime(props.at)}
        </time>
      </p>
      {research.note !== null ? (
        <p className="ml-5 min-w-0 break-words text-fg">{research.note}</p>
      ) : null}
      {research.unanswered.length > 0 ? (
        <ul
          aria-label="Left open"
          className="ml-5 grid gap-0.5 [&>li]:list-disc [&>li]:ml-4"
        >
          {research.unanswered.map((item, index) => (
            <li key={`${index}-${item}`} className="min-w-0 break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
