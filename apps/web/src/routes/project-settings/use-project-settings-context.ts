/**
 * `useProjectSettingsContext()`: the editor state a project-settings tab reads.
 *
 * Why: the draft, the issues and the save bar live above the tabs so that switching tabs
 *   never drops an edit. The editor hands them down through the router outlet; this hook is
 *   the typed way for a tab to take them.
 *
 * Exports: useProjectSettingsContext().
 * Depends on: react-router, types/settings-layout.types.
 */

import { useOutletContext } from 'react-router';
import type { ProjectSettingsContext } from '#/types/settings-layout.types.js';

export function useProjectSettingsContext(): ProjectSettingsContext {
  return useOutletContext<ProjectSettingsContext>();
}
