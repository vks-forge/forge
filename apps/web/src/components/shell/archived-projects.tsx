/**
 * ArchivedProjects: the "Archived" section of the project switcher menu.
 *
 * Why: archived projects keep their history and the owner may want to read it or bring the
 *   project back (d-0157), but they must not look like places to start work. They sit under
 *   the open projects, dimmed, each with an archive icon. Choosing one opens it read-only;
 *   each row also has its own Unarchive action (named by a tooltip, since it is an icon)
 *   so the way back is one click from the menu. A refusal (the folder is gone) is shown as a
 *   notification with the server's reason, since the menu closes on select. The section is
 *   absent when nothing is archived.
 *
 * Exports: ArchivedProjects.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, api/use-project-settings,
 *   components/ui/tooltip, schemas/projects (type).
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Archive, ArchiveRestore } from 'lucide-react';
import { useUnarchiveProject } from '#/api/use-project-settings.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import type { ProjectView } from '#/schemas/projects.js';

const ROW =
  'flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-hover';

function ArchivedRow(props: { project: ProjectView }) {
  const { project } = props;
  const unarchive = useUnarchiveProject(project.slug, { errorToast: true });
  const label = `Unarchive ${project.slug}`;

  return (
    <div className="flex items-center gap-1">
      <Menu.RadioItem value={project.slug} className={`${ROW} min-w-0 flex-1 text-muted`}>
        <Archive aria-hidden="true" className="size-4 shrink-0" />
        <span className="rounded-md border border-line bg-bg px-1.5 font-data text-[0.68rem] font-medium">
          {project.prefix}
        </span>
        <span className="min-w-0 flex-1 truncate">{project.slug}</span>
      </Menu.RadioItem>
      <Tooltip content="Unarchive" side="right">
        <Menu.Item
          aria-label={label}
          className={`${ROW} size-9 shrink-0 justify-center px-0 font-medium text-signal`}
          onSelect={() => unarchive.mutate()}
        >
          <ArchiveRestore aria-hidden="true" className="size-4" />
        </Menu.Item>
      </Tooltip>
    </div>
  );
}

export function ArchivedProjects(props: {
  projects: readonly ProjectView[];
  slug?: string;
  onPick: (slug: string) => void;
}) {
  if (props.projects.length === 0) {
    return null;
  }

  return (
    <>
      <Menu.Separator className="my-1 h-px bg-line" />
      <Menu.Label className="px-2 pb-1 pt-1.5 text-xs font-medium text-faint">
        Archived
      </Menu.Label>
      <Menu.RadioGroup
        aria-label="Archived projects"
        {...(props.slug ? { value: props.slug } : {})}
        onValueChange={props.onPick}
      >
        {props.projects.map((project) => (
          <ArchivedRow key={project.id} project={project} />
        ))}
      </Menu.RadioGroup>
    </>
  );
}
