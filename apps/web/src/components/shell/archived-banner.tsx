/**
 * ArchivedBanner: the strip above an archived project's screens.
 *
 * Why: an archived project opens read-only (d-0157). Without a clear statement at the top, a
 *   user who typed into a disabled box or found no way to start work would not know why. The
 *   banner says so in plain words and puts the way back, Unarchive, within reach on every
 *   screen of the project. A failure (the folder is gone) is shown in the strip with the
 *   server's reason, since the user is looking at this strip when they press the button.
 *
 * Exports: ArchivedBanner.
 * Depends on: lucide-react, api/use-project-settings, api/describe-error, components/ui/button.
 */

import { Archive } from 'lucide-react';
import { describeError } from '#/api/describe-error.js';
import { useUnarchiveProject } from '#/api/use-project-settings.js';
import { Button } from '#/components/ui/button.js';

export function ArchivedBanner(props: { slug: string }) {
  const unarchive = useUnarchiveProject(props.slug);

  return (
    <div
      role="status"
      className="mb-4 grid gap-2 rounded-xl border border-line bg-hover p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Archive aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-sm font-medium">
          This project is archived. It takes no new work.
        </p>
        <Button
          variant="primary"
          status={unarchive.isPending ? 'loading' : unarchive.isError ? 'error' : 'idle'}
          onClick={() => unarchive.mutate()}
        >
          Unarchive
        </Button>
      </div>
      {unarchive.isError ? (
        <p role="alert" className="text-sm text-danger">
          Not unarchived. {describeError(unarchive.error).detail}
        </p>
      ) : null}
    </div>
  );
}
