/**
 * ExportButton: write the project's memory out as markdown files.
 *
 * Why: the database is where memory lives now, but the owner must always be able to take it
 *   with them as plain files they can read, diff and keep in git. One press writes the whole
 *   project to a new folder under Forge's data folder (never inside the project's own repository)
 *   and the message names that folder with a Copy path action, because the path is the whole
 *   point of the answer. A project still on files has nothing to export yet, so the button is
 *   disabled and says why in words next to it; a refusal from the server is explained in
 *   words, not as a status code.
 *
 * Exports: ExportButton.
 * Depends on: lucide-react, api/use-memory, api/api-error, api/describe-error, components/ui/button,
 *   domain/memory-import-copy, state/notify/notify-context.
 */

import { FileDown } from 'lucide-react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useExportMemory, useMemoryImport } from '#/api/use-memory.js';
import { Button } from '#/components/ui/button.js';
import { RETRY_REFUSALS, isFileBacked } from '#/domain/memory-import-copy.js';
import { useNotify } from '#/state/notify/notify-context.js';

const TOAST_MS = 20_000;

export function ExportButton(props: { slug: string; online: boolean }) {
  const exporter = useExportMemory(props.slug);
  const notify = useNotify();
  const onFiles = isFileBacked(useMemoryImport(props.slug).data);

  function run(): void {
    exporter.mutate(undefined, {
      onSuccess: (reply) =>
        notify.success(
          `Exported ${reply.files} file${reply.files === 1 ? '' : 's'} as markdown`,
          {
            description: reply.path,
            duration: TOAST_MS,
            action: {
              label: 'Copy path',
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(reply.path);
                } catch {
                  notify.error('Could not copy the path', {
                    description:
                      'Your browser blocked clipboard access. Select it from the message.',
                  });

                  return false;
                }
              },
            },
          },
        ),
      onError: (error) =>
        notify.error('Export failed', {
          description:
            error instanceof ApiError && error.code && RETRY_REFUSALS[error.code]
              ? RETRY_REFUSALS[error.code]
              : describeError(error).detail,
        }),
    });
  }

  const blocked = onFiles ? RETRY_REFUSALS['memory_not_migrated'] : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={run}
        status={exporter.isPending ? 'loading' : 'idle'}
        disabled={onFiles || !props.online}
        aria-describedby={blocked ? 'export-blocked' : undefined}
      >
        <FileDown aria-hidden="true" className="size-4" />
        Export markdown
      </Button>
      {blocked ? (
        <p id="export-blocked" className="max-w-xs text-xs text-muted">
          {blocked}
        </p>
      ) : null}
    </div>
  );
}
