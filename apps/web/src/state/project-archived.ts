/**
 * `ProjectArchivedContext` and `useProjectArchived()`: whether the project on screen is archived.
 *
 * Why: an archived project takes no new work (d-0157), but the controls that would start work
 *   (the chat composer, the steer box) live deep in different screens. Rather than pass a flag
 *   through every screen, the project gate publishes it once and each such control asks. The
 *   default is `false`, so a control rendered outside a project (tests, previews) stays usable.
 *
 * Exports: ProjectArchivedContext, useProjectArchived().
 * Depends on: react.
 */

import { createContext, useContext } from 'react';

export const ProjectArchivedContext = createContext(false);

export function useProjectArchived(): boolean {
  return useContext(ProjectArchivedContext);
}
