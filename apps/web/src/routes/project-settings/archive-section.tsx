/**
 * ArchiveSection: retire a project, or bring an archived one back, behind a confirm.
 *
 * Why: archiving keeps a project's history but stops new work and moves it out of the open
 *   list of the switcher (d-0104); the owner can undo it (d-0157). It sits apart at the foot of
 *   the page, not among the settings, and the dialog names the project and says what changes,
 *   so neither direction can be hit by habit. After archiving the user is taken to another
 *   project, since this one is now read-only. When the project is archived the same place
 *   offers "Unarchive project" instead; if its folder has gone the server refuses with a plain
 *   reason and the project stays archived, shown under the button.
 *
 * Exports: ArchiveSection.
 * Depends on: react, react-router, api/use-project-settings, components/ui/*, state/notify.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useArchiveProject, useUnarchiveProject } from '#/api/use-project-settings.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { useNotify } from '#/state/notify/notify-context.js';

export function ArchiveSection(props: {
  slug: string;
  archived: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const archive = useArchiveProject(props.slug);
  const unarchive = useUnarchiveProject(props.slug);
  const navigate = useNavigate();
  const notify = useNotify();
  const action = props.archived ? unarchive : archive;
  const label = props.archived ? 'Unarchive project' : 'Archive project';

  return (
    <section aria-labelledby="archive-heading" className="grid gap-3">
      <h2 id="archive-heading" className="text-base font-semibold">
        {label}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <p className="max-w-prose text-sm text-muted">
          {props.archived
            ? 'This project is archived: it keeps its history, takes no new work and is listed under Archived in the project switcher. Unarchiving opens it for work again.'
            : 'An archived project keeps its history but takes no new work and moves to the Archived section of the project switcher. You can unarchive it later.'}
        </p>
        <Button
          variant={props.archived ? 'primary' : 'danger'}
          disabled={props.disabled}
          status={action.isPending ? 'loading' : action.isError ? 'error' : 'idle'}
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
      </div>
      {action.isError ? (
        <p role="alert" className="text-sm text-danger">
          {props.archived ? 'Not unarchived.' : 'Not archived.'}{' '}
          {describeError(action.error).detail}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={props.archived ? `Unarchive ${props.slug}?` : `Archive ${props.slug}?`}
        description={
          props.archived
            ? 'It will take new work again and return to the open projects in the switcher.'
            : 'It will stop taking new work and move to the Archived section of the project switcher. Its history stays, and you can unarchive it from the switcher or this page.'
        }
        confirmLabel={label}
        tone={props.archived ? 'primary' : 'danger'}
        onConfirm={() =>
          props.archived
            ? unarchive.mutate()
            : archive.mutate(undefined, {
                onSuccess: () => {
                  notify.success('Project archived', { description: props.slug });
                  void navigate('/');
                },
              })
        }
      />
    </section>
  );
}
