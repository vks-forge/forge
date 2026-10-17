/**
 * ForgeSettingsLayout: the tab list shared by every `/settings/*` screen.
 *
 * Why: General, Director, Limits, Harnesses and GitHub are siblings the owner hops between
 *   while setting Forge up. A left tab list on every one of them (a harness's own page
 *   included, under Harnesses) shows what exists and where you are, instead of making the
 *   owner go back to the sidebar. Each page keeps its own header and sections; this route only
 *   frames them.
 *
 * Exports: ForgeSettingsLayout.
 * Depends on: react-router, lucide-react, components/settings/settings-layout,
 *   domain/nav-entries, types/settings-layout.types.
 */

import { Cpu, Folder, Gauge, Plug, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Outlet } from 'react-router';
import { SettingsLayout } from '#/components/settings/settings-layout.js';
import { SETTINGS_NAV, settingsPath } from '#/domain/nav-entries.js';
import type { SettingsTab } from '#/types/settings-layout.types.js';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  general: Folder,
  director: Workflow,
  limits: Gauge,
  harnesses: Cpu,
  github: Plug,
};

const TABS: readonly SettingsTab[] = SETTINGS_NAV.map((entry) => ({
  to: settingsPath(entry.segment),
  label: entry.label,
  icon: ICONS[entry.segment] ?? Folder,
}));

export function ForgeSettingsLayout() {
  return (
    <SettingsLayout label="Settings sections" tabs={TABS}>
      <Outlet />
    </SettingsLayout>
  );
}
