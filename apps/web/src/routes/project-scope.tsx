/**
 * ProjectScope: the gate in front of every `/p/<slug>/...` screen.
 *
 * Why: every project screen needs the project to exist before it draws anything. Doing the
 *   check once here means each screen can assume a valid project and only handle its own data:
 *   while the list loads the user sees a skeleton, when Forge is unreachable they see why and
 *   a retry, and a mistyped or archived slug gets a clear "no such project" with a way back
 *   instead of an empty page. It also remembers the project so Forge settings and "back"
 *   return to it.
 *
 * Exports: ProjectScope.
 * Depends on: react, react-router, api/use-projects, api/describe-error,
 *   components/status/state-panel, domain/nav-entries, state/current-project.
 */

import { useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useProjects } from '#/api/use-projects.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { rememberProject } from '#/state/current-project.js';

export function ProjectScope() {
  const { slug = '' } = useParams();
  const query = useProjects();
  const known = query.data?.some((p) => p.slug === slug) ?? false;

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
    const first = query.data[0];

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

  return <Outlet />;
}
