/**
 * ProjectScope: the gate in front of every `/p/<slug>/...` screen.
 *
 * Why: every project screen needs the project to exist before it draws anything. Doing the
 *   check once here means each screen can assume a valid project and only handle its own data:
 *   while the list loads the user sees a skeleton, when Forge is unreachable they see why and
 *   a retry, and a mistyped or archived slug gets a clear "no such project" with a way back
 *   instead of an empty page. It also remembers the project so Forge settings and "back"
 *   return to it. An archived project opens read-only (d-0157): a banner with Unarchive sits above
 *   its screens and the controls that would start work read the archived flag from the context.
 *   It also opens the project's live change stream, once, for everything inside it (d-0132).
 *
 * Exports: ProjectScope.
 * Depends on: react, react-router, api/use-projects, api/use-project-events, api/describe-error,
 *   components/status/state-panel, components/shell/archived-banner, domain/nav-entries,
 *   state/current-project, state/project-archived.
 */

import { useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useProjectEvents } from '#/api/use-project-events.js';
import { archivedProjects, openProjects, useAllProjects } from '#/api/use-projects.js';
import { ArchivedBanner } from '#/components/shell/archived-banner.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { rememberProject } from '#/state/current-project.js';
import { ProjectArchivedContext } from '#/state/project-archived.js';

export function ProjectScope() {
  const { slug = '' } = useParams();
  const query = useAllProjects();
  const known = query.data?.some((p) => p.slug === slug) ?? false;

  // Mounted here, once, so every project screen is kept fresh by the same stream.
  useProjectEvents(known ? slug : null);

  useEffect(() => {
    if (known) {
      rememberProject(slug);
    }
  }, [known, slug]);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading project" />;
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

  if (!known) {
    const first = openProjects(query.data)[0];

    return (
      <StatePanel kind="empty" title={`There is no project named “${slug}”`}>
        {first ? (
          <Link
            className="font-medium text-signal underline"
            to={projectPath(first.slug)}
          >
            Open {first.slug}
          </Link>
        ) : (
          'Forge has no projects yet.'
        )}
      </StatePanel>
    );
  }

  const archived = archivedProjects(query.data).some((p) => p.slug === slug);

  return (
    <ProjectArchivedContext.Provider value={archived}>
      {archived ? <ArchivedBanner slug={slug} /> : null}
      <Outlet />
    </ProjectArchivedContext.Provider>
  );
}
