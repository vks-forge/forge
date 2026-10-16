/**
 * ArchiveSection: retire a project, behind a confirm that says what it costs.
 *
 * Why: archiving is the one change the API allows to the project itself, and it has no
 *   reverse: the project keeps its history, takes no new work and disappears from the
 *   switcher (d-0104). It sits apart at the foot of the page, not among the settings, and the
 *   dialog names the project and states the permanence, so it cannot be hit by habit. After
 *   it succeeds the user is taken to another project, since this one no longer opens.
 *
 * Exports: ArchiveSection.
 * Depends on: react, react-router, api/use-project-settings, components/ui/*.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useArchiveProject } from '#/api/use-project-settings.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { useNotify } from '#/state/notify/notify-context.js';

export function ArchiveSection(props: { slug: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const archive = useArchiveProject(props.slug);
  const navigate = useNavigate();
  const notify = useNotify();

  return (
    <section aria-labelledby="archive-heading" className="grid gap-3">
      <h2 id="archive-heading" className="text-base font-semibold">
        Archive project
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <p className="max-w-prose text-sm text-muted">
          An archived project keeps its history but takes no new work and leaves the
          project switcher. This cannot be undone from here.
        </p>
        <Button
          variant="danger"
          disabled={props.disabled}
          status={archive.isPending ? 'loading' : archive.isError ? 'error' : 'idle'}
          onClick={() => setOpen(true)}
        >
          Archive project
        </Button>
      </div>
      {archive.isError ? (
        <p role="alert" className="text-sm text-danger">
          Not archived. {describeError(archive.error).detail}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Archive ${props.slug}?`}
        description="It will stop taking new work and disappear from the project switcher. Its history stays. There is no way to bring it back from this screen."
        confirmLabel="Archive project"
        tone="danger"
        onConfirm={() =>
          archive.mutate(undefined, {
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
