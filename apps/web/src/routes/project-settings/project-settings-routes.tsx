/**
 * The route table of one project's settings (`/p/:slug/settings/*`).
 *
 * Why: every section is its own URL so it can be linked and bookmarked, and the bare
 *   `/p/:slug/settings` (old bookmarks, the sidebar entry) lands on the first section. An
 *   unknown section is a not-found, never a blank pane. The editor above these routes keeps
 *   the draft, so moving between them loses nothing.
 *
 * Exports: projectSettingsRoutes, PROJECT_SETTINGS_SECTIONS.
 * Depends on: react-router, lucide-react, routes/project-settings/project-settings-tabs.
 */

import {
  Archive,
  Bot,
  Clock,
  FolderGit2,
  Info,
  Layers,
  ListChecks,
  Telescope,
  Users,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { NotFound } from '#/routes/not-found.js';
import {
  AgentsTab,
  ChecksTab,
  DangerTab,
  DirectorTab,
  HistoryTab,
  PipelinesTab,
  ProjectTab,
  ResearchTab,
  RepositoryTab,
  WorkersTab,
} from '#/routes/project-settings/project-settings-tabs.js';

/** The tabs in order: URL segment, label and icon. */
export const PROJECT_SETTINGS_SECTIONS: readonly {
  segment: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { segment: 'project', label: 'Project', icon: Info },
  { segment: 'workers', label: 'Workers', icon: Users },
  { segment: 'checks', label: 'Checks', icon: ListChecks },
  { segment: 'repository', label: 'Repository', icon: FolderGit2 },
  { segment: 'director', label: 'Director', icon: Workflow },
  { segment: 'research', label: 'Research', icon: Telescope },
  { segment: 'agents', label: 'Agents', icon: Bot },
  { segment: 'pipelines', label: 'Pipelines', icon: Layers },
  { segment: 'history', label: 'History', icon: Clock },
  { segment: 'danger', label: 'Archive and delete', icon: Archive },
];

export const projectSettingsRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="project" replace /> },
  { path: 'project', element: <ProjectTab /> },
  { path: 'workers', element: <WorkersTab /> },
  { path: 'checks', element: <ChecksTab /> },
  { path: 'repository', element: <RepositoryTab /> },
  { path: 'director', element: <DirectorTab /> },
  { path: 'research', element: <ResearchTab /> },
  { path: 'agents', element: <AgentsTab /> },
  { path: 'pipelines', element: <PipelinesTab /> },
  { path: 'history', element: <HistoryTab /> },
  { path: 'danger', element: <DangerTab /> },
  { path: '*', element: <NotFound /> },
];
