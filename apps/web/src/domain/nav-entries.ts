/**
 * The destinations of the control room and the URLs they live at.
 *
 * Why: the sidebar, the router and the placeholder pages must agree on what exists and where.
 *   One list makes adding a screen a one-line change, and keeps project-scoped URLs
 *   (`/p/<slug>/...`) separate from Forge-wide settings (`/settings/...`), as d-0104 requires:
 *   no company-wide project Home, everything about Forge itself in its own area. The one
 *   cross-project screen is the Overview at `/` (d-0162, amending d-0104). Switching project keeps
 *   the user on the same screen of the new project, so `swapProjectSlug()` rewrites only the
 *   slug.
 *
 * Exports: OVERVIEW_PATH, PROJECT_NAV, SETTINGS_NAV, projectPath(), settingsPath(), swapProjectSlug().
 * Depends on: types/nav.types. No IO.
 */

import type { NavEntry } from '#/types/nav.types.js';

/** The cross-project Overview: `/`, first in the Forge section and where the logo leads (d-0162). */
export const OVERVIEW_PATH = '/';

export const PROJECT_NAV: readonly NavEntry[] = [
  { segment: '', label: 'Home', batch: 'W5', blurb: 'Project statistics and graphs.' },
  {
    segment: 'inbox',
    label: 'Inbox',
    batch: 'W5',
    blurb: 'Everything that needs you or has news, in one list.',
  },
  {
    segment: 'board',
    label: 'Board',
    batch: 'W3',
    blurb: 'Tickets by state, with cards arriving in W6.',
  },
  {
    segment: 'tickets',
    label: 'Tickets',
    batch: 'W3',
    blurb: 'Every ticket of the project, with state, lane and cost.',
  },
  {
    segment: 'issues',
    label: 'Issues',
    batch: 'W8',
    blurb: 'GitHub issues with the Director’s verdict.',
  },
  {
    segment: 'chat',
    label: 'Chat',
    batch: 'W6',
    blurb: 'Talk to the Director; requests become tickets.',
  },
  {
    segment: 'runs',
    label: 'Runs',
    batch: 'W5',
    blurb: 'Every Worker run, working, waiting or done.',
  },
  {
    segment: 'cost',
    label: 'Cost',
    batch: 'W5',
    blurb: 'Where the money and tokens went.',
  },
  {
    segment: 'memory',
    label: 'Memory',
    batch: 'W4',
    blurb: 'Decisions, rejections and proposals to approve.',
  },
  {
    segment: 'settings',
    label: 'Project settings',
    batch: 'W4',
    blurb: 'Checks, repository and per-project overrides.',
  },
];

export const SETTINGS_NAV: readonly NavEntry[] = [
  {
    segment: 'general',
    label: 'General',
    batch: 'W2',
    blurb: 'Data folder, backups and updates.',
  },
  {
    segment: 'director',
    label: 'Director',
    batch: 'W2',
    blurb: 'Models per step, house rules and the planning flow.',
  },
  {
    segment: 'limits',
    label: 'Limits',
    batch: 'W2',
    blurb: 'Global, per-project and per-harness limits.',
  },
  {
    segment: 'harnesses',
    label: 'Harnesses',
    batch: 'W2',
    blurb: 'Installed CLIs, login mode and tool approvals.',
  },
  {
    segment: 'github',
    label: 'GitHub',
    batch: 'W2',
    blurb: 'Connections and installations.',
  },
];

/** `/p/<slug>` or `/p/<slug>/<segment>`. */
export function projectPath(slug: string, segment = ''): string {
  return segment === '' ? `/p/${slug}` : `/p/${slug}/${segment}`;
}

export function settingsPath(segment: string): string {
  return `/settings/${segment}`;
}

/** The same screen under another project; from any other URL, the new project's Home. */
export function swapProjectSlug(pathname: string, slug: string): string {
  const match = /^\/p\/[^/]+(\/.*)?$/.exec(pathname);
  const rest = match?.[1] ?? '';

  return `/p/${slug}${rest.replace(/\/$/, '')}`;
}
