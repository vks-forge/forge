/**
 * SidebarContent: everything inside the sidebar, shared by the desktop column and the mobile drawer.
 *
 * Why: the sidebar is the app's table of contents and has one job order (d-0104): project
 *   switcher on top, the current project's screens in the middle, Forge-wide settings at the
 *   foot, kept apart because they are not about any one project. Desktop shows it as a
 *   column and phones as a drawer; sharing this body means the two can never drift.
 *
 * Exports: SidebarContent.
 * Depends on: lucide-react, api/use-projects, domain/nav-entries,
 *   state/current-project, components/shell/*.
 */

import {
  Activity,
  Brain,
  CircleDot,
  Cpu,
  Folder,
  Coins,
  Gauge,
  House,
  Inbox,
  MessageSquare,
  Plug,
  Settings,
  SquareKanban,
  type LucideIcon,
} from 'lucide-react';
import { useInboxCounts } from '#/api/use-inbox.js';
import { useProjects } from '#/api/use-projects.js';
import { NavLinkItem } from '#/components/shell/nav-link-item.js';
import { ProjectSwitcher } from '#/components/shell/project-switcher.js';
import { ThemeToggle } from '#/components/shell/theme-toggle.js';
import {
  PROJECT_NAV,
  projectPath,
  SETTINGS_NAV,
  settingsPath,
} from '#/domain/nav-entries.js';
import { useCurrentSlug } from '#/state/current-project.js';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  '': House,
  inbox: Inbox,
  cost: Coins,
  board: SquareKanban,
  issues: CircleDot,
  chat: MessageSquare,
  runs: Activity,
  memory: Brain,
  settings: Settings,
  harnesses: Cpu,
  github: Plug,
  limits: Gauge,
  general: Folder,
};

export function SidebarContent() {
  const projects = useProjects();
  const slug = useCurrentSlug(projects.data);
  const inbox = useInboxCounts(slug ?? '');

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-3">
      <div className="flex flex-col gap-3">
        <span className="px-1 pt-1 text-sm font-semibold tracking-tight">Forge</span>
        <ProjectSwitcher />
      </div>
      <nav
        aria-label="Project"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      >
        {slug ? (
          PROJECT_NAV.map((entry) => (
            <NavLinkItem
              key={entry.segment}
              to={projectPath(slug, entry.segment)}
              label={entry.label}
              icon={ICONS[entry.segment] ?? House}
              exact={entry.segment === ''}
              badge={
                entry.segment === 'inbox' && inbox.data
                  ? {
                      count: inbox.data.unread,
                      label: `${inbox.data.unread} unread in Inbox`,
                      attention: inbox.data.needs_action > 0,
                    }
                  : undefined
              }
            />
          ))
        ) : (
          <p className="px-2.5 text-sm text-muted">
            Choose a project to see its screens.
          </p>
        )}
      </nav>
      <nav
        aria-label="Forge settings"
        className="flex flex-col gap-0.5 border-t border-line pt-3"
      >
        <span className="px-2.5 pb-1 text-xs font-medium text-faint">Forge settings</span>
        {SETTINGS_NAV.map((entry) => (
          <NavLinkItem
            key={entry.segment}
            to={settingsPath(entry.segment)}
            label={entry.label}
            icon={ICONS[entry.segment] ?? Settings}
          />
        ))}
        <div className="mt-1 flex items-center justify-end">
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
