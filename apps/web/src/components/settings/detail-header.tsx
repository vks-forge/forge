/**
 * DetailHeader: the hero at the top of every Forge settings page.
 *
 * Why: a settings page is an object the owner came to inspect (a harness, the GitHub link,
 *   the limits), and the first screenful must answer "what is this, is it healthy, what can I
 *   do" before any form. So the header reads top to bottom as: where you are (breadcrumb), what
 *   it is (icon tile, name, id chip, status badge, one line), what you can do (actions on the
 *   same row), the facts that matter in a strip (value `—` when the API does not know,
 *   never invented). Section tabs live in SectionNav, a sibling, so they can stick.
 *
 * Exports: DetailHeader.
 * Depends on: react, react-router, lucide-react, types/settings-ui.types.
 */

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Crumb, HeroBadge, HeroFact } from '#/types/settings-ui.types.js';

const BADGE = {
  good: { dot: 'bg-good', box: 'border-line' },
  attn: { dot: 'bg-attn', box: 'border-attn bg-attn-soft' },
  bad: { dot: 'bg-danger', box: 'border-danger bg-danger-soft' },
  quiet: { dot: 'bg-faint', box: 'border-line' },
} as const;

function Badge(props: { badge: HeroBadge }) {
  const { dot, box } = BADGE[props.badge.tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${box}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {props.badge.label}
    </span>
  );
}

export function DetailHeader(props: {
  crumbs: readonly Crumb[];
  icon: LucideIcon;
  title: string;
  /** A small mono chip beside the name, such as the registry id. */
  chip?: string | undefined;
  badge?: HeroBadge | undefined;
  description: string;
  actions?: ReactNode;
  facts?: readonly HeroFact[] | undefined;
}) {
  const Icon = props.icon;

  return (
    <header className="grid gap-5">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
          {props.crumbs.map((crumb, index) => (
            <Fragment key={crumb.label}>
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="size-3.5 text-faint" />
              ) : null}
              <li>
                {crumb.to ? (
                  <Link className="rounded hover:text-fg hover:underline" to={crumb.to}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-fg">
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface text-fg"
          >
            <Icon className="size-6" />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">
                {props.title}
              </h1>
              {props.chip ? (
                <span className="rounded-md bg-hover px-1.5 py-0.5 font-data text-xs text-muted">
                  {props.chip}
                </span>
              ) : null}
              {props.badge ? <Badge badge={props.badge} /> : null}
            </div>
            <p className="max-w-prose text-sm text-muted">{props.description}</p>
          </div>
        </div>
        {props.actions ? (
          <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
        ) : null}
      </div>
      {props.facts && props.facts.length > 0 ? (
        <dl className="grid grid-cols-2 gap-y-4 rounded-xl border border-line bg-surface py-4 md:flex md:py-0">
          {props.facts.map((fact) => (
            <div
              key={fact.label}
              className="grid min-w-0 content-center gap-1 px-5 md:flex-1 md:border-l md:border-line md:py-4 md:first:border-l-0"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                {fact.label}
              </dt>
              <dd
                className={`truncate text-sm font-medium ${fact.mono ? 'font-data' : ''}`}
                title={fact.value}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
