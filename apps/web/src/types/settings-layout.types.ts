/**
 * Shapes of the two-column settings layout and the project-settings editor it frames.
 *
 * Why: Forge settings and project settings share one layout (tabs on the left, one section on
 *   the right), but project settings also keep one draft and one save bar above the tabs.
 *   Naming the tab and the editor's shared state once lets the layout stay ignorant of what a
 *   section holds, and lets each section read the same draft without props threading through
 *   the router.
 *
 * Exports: SettingsTab, ProjectSettingsContext.
 * Depends on: lucide-react, schemas/projects, types/project-settings.types. Types only.
 */

import type { LucideIcon } from 'lucide-react';
import type { ProjectView } from '#/schemas/projects.js';
import type {
  SettingsDraft,
  SettingsIssue,
  SettingsSnapshot,
} from '#/types/project-settings.types.js';

/** One tab of the settings layout: a real link, so each section has its own URL. */
export interface SettingsTab {
  /** Absolute path of the section. */
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** What the project-settings editor shares with every section through the router outlet. */
export interface ProjectSettingsContext {
  readonly slug: string;
  readonly project: ProjectView | undefined;
  /** The newest saved version: facts and history read this. */
  readonly latest: SettingsSnapshot;
  /** The version the draft started from: inherited values read this. */
  readonly opened: SettingsSnapshot;
  readonly draft: SettingsDraft;
  readonly issues: readonly SettingsIssue[];
  readonly onChange: (next: SettingsDraft) => void;
  /** A save is in flight: fields are locked. */
  readonly saving: boolean;
  readonly online: boolean;
}
