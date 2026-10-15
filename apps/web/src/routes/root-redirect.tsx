/**
 * RootRedirect: `/` opens the first-run wizard on a fresh Forge, else the user's project.
 *
 * Why: d-0104 removes the company-wide Home; Home is per project and opens on the first
 *   connected project (or the one the user last used this session). A fresh install has no
 *   project, and an empty list would be a dead end, so when the server says setup is not
 *   finished `/` sends the person to the wizard, unless they chose "Finish later". This route
 *   only decides where to go and replaces itself, so the Back button never returns to a
 *   blank `/`. If Forge's system answer cannot be read, the project list decides alone: a
 *   missing answer must never lock a working install out of its projects. With no projects
 *   and the wizard declined, it says so and offers the two ways forward.
 *
 * Exports: RootRedirect.
 * Depends on: react-router, api/use-projects, api/use-onboarding, api/describe-error,
 *   components/status/state-panel, domain/nav-entries, state/{current-project,use-welcome-prefs}.
 */

import { Link, Navigate } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useSystem } from '#/api/use-onboarding.js';
import { useProjects } from '#/api/use-projects.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { recalledProject } from '#/state/current-project.js';
import { useWelcomePrefs } from '#/state/use-welcome-prefs.js';

export function RootRedirect() {
  const query = useProjects();
  const system = useSystem();
  const welcome = useWelcomePrefs();

  if (query.isPending || system.isPending) {
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

  if (system.data && !system.data.first_run.complete && !welcome.dismissed) {
    return <Navigate to="/welcome" replace />;
  }

  const target = query.data.find((p) => p.slug === recalledProject()) ?? query.data[0];
  if (!target) {
    return (
      <StatePanel kind="empty" title="No projects yet">
        <p>
          Add a repository from this machine to start, or finish setting Forge up first.
        </p>
        <p className="mt-3 flex flex-wrap gap-4">
          <Link className="font-medium text-signal underline" to="/projects/new">
            Add project
          </Link>
          <Link
            className="font-medium text-signal underline"
            to="/welcome"
            onClick={welcome.reopen}
          >
            Resume setup
          </Link>
        </p>
      </StatePanel>
    );
  }

  return <Navigate to={projectPath(target.slug)} replace />;
}
