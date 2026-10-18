/**
 * ImportBanner: where this project's memory lives, and what to do when the move did not finish.
 *
 * Why: Forge moves each project's memory from its old git repository into its database. Until
 *   that is verified the project still works from the old repository, but search, links, history
 *   and export wait. The owner must see which of five situations they are in: nothing to move
 *   (say nothing), moving now (say so, and offer a refresh), done (one quiet line with the backup
 *   path to copy), some files could not be read (name each file and why, say the memory still
 *   works, offer Retry import) or failed (say why, offer Retry). Retrying while an import already
 *   runs is refused by the server and explained, not shown as a failure of the owner.
 *
 * Exports: ImportBanner.
 * Depends on: react, lucide-react, api/use-memory, api/api-error, api/describe-error,
 *   components/memory/copy-path-button, components/ui/button, domain/memory-import-copy.
 */

import { CircleAlert, Database, LoaderCircle } from 'lucide-react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useMemoryImport, useRetryImport } from '#/api/use-memory.js';
import { CopyPathButton } from '#/components/memory/copy-path-button.js';
import { Button } from '#/components/ui/button.js';
import { RETRY_REFUSALS, importLine } from '#/domain/memory-import-copy.js';

export function ImportBanner(props: { slug: string; online: boolean }) {
  const status = useMemoryImport(props.slug);
  const retry = useRetryImport(props.slug);
  const data = status.data;

  if (status.isError) {
    return (
      <p
        role="status"
        className="flex flex-wrap items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm"
      >
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Could not read the memory migration status. {describeError(status.error).detail}
        </span>
        <Button onClick={() => void status.refetch()} className="min-h-8">
          Try again
        </Button>
      </p>
    );
  }

  if (data === undefined || data.state === 'not_needed') {
    return null;
  }

  const refusal =
    retry.error instanceof ApiError && retry.error.code
      ? (RETRY_REFUSALS[retry.error.code] ?? retry.error.message)
      : retry.isError
        ? describeError(retry.error).detail
        : null;

  const retryButton = (
    <Button
      variant="primary"
      onClick={() => retry.mutate()}
      status={retry.isPending ? 'loading' : 'idle'}
      disabled={!props.online}
    >
      Retry import
    </Button>
  );

  if (data.state === 'verified') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Database aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{importLine(data)}</span>
        {data.backup_path ? <CopyPathButton path={data.backup_path} /> : null}
      </p>
    );
  }

  if (data.state === 'pending') {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-lg bg-hover px-3 py-2 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1">
          Migrating memory to Forge’s database… It keeps working from the old repository
          meanwhile.
        </span>
        <Button onClick={() => void status.refetch()} className="min-h-8">
          Check again
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label="Memory migration"
      className="grid gap-3 rounded-lg border border-attn bg-attn-soft px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="grid min-w-0 gap-1">
          <p className="font-medium">
            {data.state === 'failed'
              ? 'Memory could not be moved to the database'
              : 'Some memory files could not be read'}
          </p>
          <p>
            Memory still works from the old repository. Nothing was deleted, and search,
            links, history and export wait until the move is verified.
          </p>
          {data.message ? <p className="break-words">{data.message}</p> : null}
        </div>
      </div>
      {data.rejects.length > 0 ? (
        <ul aria-label="Unreadable files" className="grid gap-1 pl-6">
          {data.rejects.map((reject) => (
            <li key={reject.path} className="break-words">
              <span className="font-data text-xs">{reject.path}</span>
              <span className="text-muted"> · {reject.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 pl-6">
        {retryButton}
        {refusal ? (
          <p role="alert" className="text-xs">
            {refusal}
          </p>
        ) : null}
      </div>
    </section>
  );
}
