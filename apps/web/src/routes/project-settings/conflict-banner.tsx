/**
 * ConflictBanner: "these settings changed since you opened them."
 *
 * Why: two tabs, or a person and the onboarding flow, can save settings at the same time. The
 *   server refuses the second save with 409 rather than overwrite (compare-and-swap), and
 *   the screen must turn that into a decision the user can make: read what the other save
 *   changed, then either reload the latest (losing their edits, which they can see were
 *   unsaved) or keep editing. It never saves over the newer version on its own. The same
 *   banner appears when a background refresh finds a newer version, before any save fails.
 *
 * Exports: ConflictBanner.
 * Depends on: react, lucide-react, domain/doc-diff, components/ui/button, change-list.
 */

import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { diffDocs } from '#/domain/doc-diff.js';
import { formatWhen } from '#/domain/format-time.js';
import { ChangeList } from '#/routes/project-settings/change-list.js';
import type { SettingsSnapshot } from '#/types/project-settings.types.js';

export function ConflictBanner(props: {
  opened: SettingsSnapshot;
  latest: SettingsSnapshot;
  onReload: () => void;
}) {
  const [review, setReview] = useState(false);
  const newest = props.latest.versions.at(-1);

  return (
    <div
      role="alert"
      className="grid gap-3 rounded-xl border border-attn bg-attn-soft p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          These settings changed since you opened them: you started from v
          {props.opened.version.project}, the latest is v{props.latest.version.project}
          {newest
            ? `, saved by ${newest.author} ${formatWhen(newest.created_at)} (“${newest.reason}”)`
            : ''}
          . Saving is paused so nothing is overwritten.
        </span>
      </p>
      {review ? (
        <div className="rounded-lg bg-surface p-3">
          <ChangeList changes={diffDocs(props.opened.override, props.latest.override)} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={() => setReview(!review)} aria-expanded={review}>
          {review ? 'Hide their changes' : 'Review their changes'}
        </Button>
        <Button variant="primary" onClick={props.onReload}>
          Reload latest and discard my edits
        </Button>
      </div>
    </div>
  );
}
