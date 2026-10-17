/**
 * The seven tabs of project settings: Project, Workers, Checks, Repository, Director,
 * History, Archive and delete.
 *
 * Why: one long page made an owner scroll past everything to reach the one thing they came
 *   for, and hid how much there is. Each tab here is a thin view over the editor's shared
 *   draft (use-project-settings-context): the fields moved, the rules did not. Read-only
 *   facts, inherited-versus-overridden fields, the Director override and the destructive
 *   actions each get their own URL, so a link can point at the exact section.
 *
 * Exports: ProjectTab, WorkersTab, ChecksTab, RepositoryTab, DirectorTab, HistoryTab, DangerTab.
 * Depends on: routes/project-settings/*.
 */

import { ArchiveSection } from '#/routes/project-settings/archive-section.js';
import { DeleteSection } from '#/routes/project-settings/delete-section.js';
import { DirectorOverride } from '#/routes/project-settings/director-override.js';
import { HistoryPanel } from '#/routes/project-settings/history-panel.js';
import { ProjectSection } from '#/routes/project-settings/project-section.js';
import { SettingsForm } from '#/routes/project-settings/settings-form.js';
import type { FormScope } from '#/types/project-settings.types.js';
import { useProjectSettingsContext } from '#/routes/project-settings/use-project-settings-context.js';

export function ProjectTab() {
  const { project, latest } = useProjectSettingsContext();

  return project ? <ProjectSection project={project} snapshot={latest} /> : null;
}

function FormTab(props: { scope: FormScope; id: string; title: string }) {
  const { opened, draft, issues, onChange, saving } = useProjectSettingsContext();

  return (
    <section aria-labelledby={props.id} className="grid gap-3">
      <h2 id={props.id} className="text-base font-semibold">
        {props.title}
      </h2>
      <SettingsForm
        scope={props.scope}
        snapshot={opened}
        draft={draft}
        issues={issues}
        onChange={onChange}
        disabled={saving}
      />
    </section>
  );
}

export function WorkersTab() {
  return <FormTab scope="workers" id="workers-heading" title="Workers" />;
}

export function ChecksTab() {
  return <FormTab scope="checks" id="checks-heading" title="Checks" />;
}

export function RepositoryTab() {
  return <FormTab scope="repository" id="overrides-heading" title="Repository" />;
}

export function DirectorTab() {
  const { opened, draft, issues, onChange, saving } = useProjectSettingsContext();

  return (
    <section aria-labelledby="director-heading" className="grid gap-3">
      <h2 id="director-heading" className="text-base font-semibold">
        Director for this project
      </h2>
      <DirectorOverride
        snapshot={opened}
        draft={draft}
        issues={issues.filter((i) => i.field === 'director').map((i) => i.message)}
        onChange={onChange}
        disabled={saving}
      />
    </section>
  );
}

export function HistoryTab() {
  const { latest } = useProjectSettingsContext();

  return <HistoryPanel versions={latest.versions} />;
}

export function DangerTab() {
  const { slug, project, online } = useProjectSettingsContext();

  return (
    <div className="grid gap-6">
      <ArchiveSection
        slug={slug}
        archived={project?.status === 'archived'}
        disabled={!online}
      />
      <DeleteSection slug={slug} localPath={project?.local_path} disabled={!online} />
    </div>
  );
}
