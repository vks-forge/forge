/**
 * Project settings, Pipelines: how this project's lanes differ from the company, and its routing rules.
 *
 * Why: a project rarely wants different stages for a whole lane, but often wants one extra
 *   check for some files (the network reviewer for Terraform) or a stricter Standard lane. This
 *   tab shows the three lanes as this project sees them (the company default, or its own list
 *   marked "Changed from company default", with Reset back to the company), and the routing
 *   rules that pull in an extra check when a change touches certain paths. Saves are versions of
 *   the project's settings and go through the controls here, so this tab has no shared save bar.
 *
 * Exports: PipelinesSection.
 * Depends on: components/pipelines/pipelines-workspace, routes/project-settings/use-project-settings-context.
 */

import { useMemo } from 'react';
import { PipelinesWorkspace } from '#/components/pipelines/pipelines-workspace.js';
import { useProjectSettingsContext } from '#/routes/project-settings/use-project-settings-context.js';

export function PipelinesSection() {
  const { slug } = useProjectSettingsContext();
  const scope = useMemo(() => ({ kind: 'project', slug }) as const, [slug]);

  return <PipelinesWorkspace scope={scope} />;
}
