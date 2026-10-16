/**
 * DeleteSection: remove a project from Forge, behind a popup that makes the user type its name.
 *
 * Why: archiving keeps a project's slug, prefix and folder claimed, so someone who added the
 *   wrong folder or wants a clean start needs a real delete (d-0127). It destroys Forge's
 *   record of the work (tickets, runs, history, memory, worktrees), so it sits last in a
 *   danger zone and the popup lists exactly what goes, says in plain words that the project's
 *   own folder and files are left alone, and keeps the red button off until the slug is typed.
 *   While the request is in flight the popup cannot be closed; a refusal (work still running)
 *   shows inside the popup with what to do. On success the user is taken to the home screen,
 *   since the project no longer opens.
 *
 * Exports: DeleteSection.
 * Depends on: react, react-router, api/*, components/ui/*, state/notify.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useDeleteProject } from '#/api/use-project-settings.js';
import { Button } from '#/components/ui/button.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { Modal } from '#/components/ui/modal.js';
import { useNotify } from '#/state/notify/notify-context.js';

const FORM_ID = 'delete-project-form';

/** What the user is told when the server refuses; a busy project has a clear next step. */
function refusalText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'project_busy') {
    return 'Stop its running work first, then try again.';
  }

  return describeError(error).detail;
}

export function DeleteSection(props: {
  slug: string;
  localPath: string | undefined;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const remove = useDeleteProject(props.slug);
  const navigate = useNavigate();
  const notify = useNotify();

  const matches = typed === props.slug;

  const close = (): void => {
    setOpen(false);
    setTyped('');
    remove.reset();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!matches || remove.isPending) {
      return;
    }

    remove.mutate(typed, {
      onSuccess: () => {
        notify.success('Project deleted', { description: props.slug });
        void navigate('/');
      },
    });
  };

  return (
    <section aria-labelledby="delete-heading" className="grid gap-3">
      <h2 id="delete-heading" className="text-base font-semibold text-danger">
        Delete project
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-surface p-4 sm:p-5">
        <p className="max-w-prose text-sm text-muted">
          Removes this project from Forge so the same folder can be added again. Your
          project folder and its files are not touched.
        </p>
        <Button variant="danger" disabled={props.disabled} onClick={() => setOpen(true)}>
          Delete project
        </Button>
      </div>
      <Modal
        open={open}
        onClose={close}
        busy={remove.isPending}
        title={`Delete ${props.slug}?`}
        description="This removes the project from Forge. It cannot be undone."
        primary={
          <Button
            type="submit"
            form={FORM_ID}
            variant="danger"
            disabled={!matches}
            status={remove.isPending ? 'loading' : 'idle'}
          >
            Delete project
          </Button>
        }
      >
        <form id={FORM_ID} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2 text-sm">
            <p>Forge will remove:</p>
            <ul className="list-disc pl-5 text-muted">
              <li>every ticket and run of this project, with their history</li>
              <li>its cards, inbox marks and project memory</li>
              <li>the worktrees Forge made for it</li>
            </ul>
          </div>
          <p className="rounded-lg bg-hover px-3 py-2 text-sm">
            {props.localPath ? (
              <>
                The folder <span className="font-data break-all">{props.localPath}</span>{' '}
                and its files are not touched.
              </>
            ) : (
              'Your project folder and its files are not touched.'
            )}
          </p>
          <Field
            id="delete-confirm"
            label={`Type ${props.slug} to confirm`}
            error={remove.isError ? refusalText(remove.error) : undefined}
          >
            <input
              id="delete-confirm"
              className={INPUT_CLASS}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              disabled={remove.isPending}
              aria-invalid={remove.isError || undefined}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </section>
  );
}
