/**
 * OverviewProjects: one row per project with its state, waiting work, spend and a sparkline.
 *
 * Why: the totals hide which project is the one asking for attention or spending the money.
 *   Each row gives the answer in a line (status, open cards, tickets moving, items waiting on
 *   the owner, spend in the range, when it last did anything, a small activity line) and the
 *   whole row opens that project's Home, so the table is also the way in. The project name is
 *   the one real link (the rest of the row is its click area), so keyboard and screen reader
 *   users get a single clear target per row. Below 1280 px (the sidebar leaves a narrow
 *   column) the table becomes a stack of cards with the column names written beside each
 *   figure, so nothing scrolls sideways. Projects
 *   with no recorded spend show a dash, not $0.00.
 *
 * Exports: OverviewProjects.
 * Depends on: react-router, @forge/core (OverviewStats type), components/charts/sparkline,
 *   domain/{nav-entries,stats-format,relative-time}, state/use-now.
 */

import type { OverviewStats } from '@forge/core';
import { Link } from 'react-router';
import { Sparkline } from '#/components/charts/sparkline.js';
import { projectPath } from '#/domain/nav-entries.js';
import { timeAgo } from '#/domain/relative-time.js';
import { formatCount, formatUsd } from '#/domain/stats-format.js';
import { useNow } from '#/state/use-now.js';

const STATUS_LABEL: Readonly<Record<string, string>> = {
  ready: 'Ready',
  onboarding: 'Setting up',
  archived: 'Archived',
};

const HEAD = 'px-3 py-2 text-left text-xs font-medium text-muted';
const CELL =
  'flex items-baseline justify-between gap-3 px-3 py-1 xl:table-cell xl:py-2.5 xl:align-middle';

/** A column name shown beside the figure on phones only (the header row covers wider screens). */
function Label(props: { children: string }) {
  return <span className="text-xs text-muted xl:hidden">{props.children}</span>;
}

export function OverviewProjects(props: { stats: OverviewStats }) {
  const now = useNow();
  const { projects } = props.stats;

  return (
    <section aria-labelledby="overview-projects" className="grid grid-cols-1 gap-3">
      <h2 id="overview-projects" className="text-base font-semibold">
        Projects
      </h2>

      <div className="rounded-xl border border-line bg-surface">
        <table aria-label="Projects" className="block w-full xl:table">
          <thead className="hidden xl:table-header-group">
            <tr className="border-b border-line">
              <th scope="col" className={HEAD}>
                Project
              </th>
              <th scope="col" className={HEAD}>
                Status
              </th>
              <th scope="col" className={`${HEAD} xl:text-right`}>
                Open cards
              </th>
              <th scope="col" className={`${HEAD} xl:text-right`}>
                In progress
              </th>
              <th scope="col" className={`${HEAD} xl:text-right`}>
                Waiting on you
              </th>
              <th scope="col" className={`${HEAD} xl:text-right`}>
                Spend
              </th>
              <th scope="col" className={HEAD}>
                Last activity
              </th>
              <th scope="col" className={HEAD}>
                Runs
              </th>
            </tr>
          </thead>
          <tbody className="block divide-y divide-line xl:table-row-group">
            {projects.map((p) => (
              <tr
                key={p.slug}
                className="relative grid grid-cols-1 gap-x-6 py-2 transition-colors duration-150 hover:bg-hover sm:grid-cols-2 xl:table-row xl:py-0"
              >
                <th
                  scope="row"
                  className={`${CELL} text-left font-medium sm:col-span-2 xl:col-auto`}
                >
                  <Link
                    to={projectPath(p.slug)}
                    className="font-data text-sm after:absolute after:inset-0 after:content-['']"
                  >
                    {p.slug}
                  </Link>
                </th>
                <td className={CELL}>
                  <Label>Status</Label>
                  <span className="text-sm">{STATUS_LABEL[p.status] ?? p.status}</span>
                </td>
                <td className={`${CELL} xl:text-right`}>
                  <Label>Open cards</Label>
                  <span className="font-data text-sm tabular-nums">
                    {formatCount(p.open_cards)}
                  </span>
                </td>
                <td className={`${CELL} xl:text-right`}>
                  <Label>In progress</Label>
                  <span className="font-data text-sm tabular-nums">
                    {formatCount(p.tickets_in_progress)}
                  </span>
                </td>
                <td className={`${CELL} xl:text-right`}>
                  <Label>Waiting on you</Label>
                  <span
                    className={`font-data text-sm tabular-nums ${
                      p.waiting_on_you > 0
                        ? 'rounded-md bg-attn-soft px-1.5 font-medium'
                        : 'text-muted'
                    }`}
                  >
                    {formatCount(p.waiting_on_you)}
                  </span>
                </td>
                <td className={`${CELL} xl:text-right`}>
                  <Label>Spend</Label>
                  <span className="font-data text-sm tabular-nums">
                    {p.spend_usd > 0 ? formatUsd(p.spend_usd) : '—'}
                  </span>
                </td>
                <td className={CELL}>
                  <Label>Last activity</Label>
                  <span className="text-sm">
                    {p.last_activity ? timeAgo(p.last_activity, now) : '—'}
                  </span>
                </td>
                <td className={CELL}>
                  <Label>Runs</Label>
                  <Sparkline label={`Runs for ${p.slug}`} values={p.spark} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
