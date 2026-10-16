/**
 * ProjectSection: the facts about the project that are fixed when it is registered.
 *
 * Why: a person editing settings needs to be sure which project and repository they are
 *   changing before they change anything. Name, repository, base branch, local folder and
 *   ticket prefix are shown read-only: the API sets them at registration and offers no edit
 *   (only archive), and an editable box that fails on save would be worse than none. The
 *   section says so, so a missing edit button reads as a rule, not a bug.
 *
 * Exports: ProjectSection.
 * Depends on: schemas/projects (type), types/project-settings.types.
 */

import type { ProjectView } from '#/schemas/projects.js';
import type { SettingsSnapshot } from '#/types/project-settings.types.js';

function Fact(props: { label: string; value: string | undefined; data?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd className={`min-w-0 break-words text-sm ${props.data ? 'font-data' : ''}`}>
        {props.value ?? 'Not set'}
      </dd>
    </div>
  );
}

export function ProjectSection(props: {
  project: ProjectView;
  snapshot: SettingsSnapshot;
}) {
  const { project } = props;
  const host = props.snapshot.config.project.git_host;
  const repo =
    project.repo_full_name ??
    (host?.kind === 'github'
      ? `${host.owner}/${host.repo}`
      : host?.kind === 'local'
        ? host.remote_path
        : undefined);

  return (
    <section aria-labelledby="project-heading" className="grid gap-3">
      <h2 id="project-heading" className="text-base font-semibold">
        Project
      </h2>
      <dl className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 sm:p-5">
        <Fact label="Name" value={project.slug} data />
        <Fact label="Ticket prefix" value={project.prefix} data />
        <Fact label="Repository" value={repo} data />
        <Fact label="Base branch" value={host?.base_branch ?? 'main'} data />
        <div className="sm:col-span-2">
          <Fact label="Local folder" value={project.local_path} data />
        </div>
        <Fact label="Status" value={project.status} />
        <Fact
          label="Detected ecosystems"
          value={project.ecosystems.join(', ') || 'None'}
        />
      </dl>
      <p className="text-xs text-muted">
        These are set when the project is registered and cannot be edited here. Settings
        below can.
      </p>
    </section>
  );
}
