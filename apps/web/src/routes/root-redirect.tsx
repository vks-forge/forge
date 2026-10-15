/**
 * RootRedirect: `/` opens the user's project, because Forge has no company home.
 *
 * Why: d-0104 removes the company-wide Home; Home is per project and opens on the first
 *   connected project (or the one the user last used this session). This route only decides
 *   which project that is and replaces itself with its Home, so the Back button never returns
 *   to a blank `/`. With no projects it says so, and when Forge is unreachable it says that.
 *
 * Exports: RootRedirect.
 * Depends on: react-router, api/use-projects, api/describe-error, components/status/state-panel,
 *   domain/nav-entries, state/current-project.
 */

import { Navigate } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useProjects } from '#/api/use-projects.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { recalledProject } from '#/state/current-project.js';

export function RootRedirect() {
  const query = useProjects();

  if (query.isPending) {
    return <StatePanel kind="loading" label="Opening your project" />;
  }

  if (query.isError) {
    const { title, detail } = describeError(query.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const target = query.data.find((p) => p.slug === recalledProject()) ?? query.data[0];
  if (!target) {
    return (
      <StatePanel kind="empty" title="No projects yet">
        Projects appear here once they are added to Forge. The new-project wizard arrives
        in W7.
      </StatePanel>
    );
  }

  return <Navigate to={projectPath(target.slug)} replace />;
}
