/**
 * SetupCacheSection: the size limit of the setup cache, what it uses now, and "Clear setup cache".
 *
 * Why: the setup cache is what makes a ticket's workspace ready in seconds instead of minutes,
 *   but it is disk the owner did not choose to fill. The owner must see how much it uses against
 *   the limit, change the limit, and give the space back, for example when a project's
 *   dependencies changed a lot. Clearing is safe but not free (the next ticket of each project
 *   installs from scratch once), so a confirmation names what is removed and how much space it
 *   frees, and the shared package downloads, which cost more to get back, are a separate
 *   checkbox that starts off. Nothing in a project changes either way.
 *
 * Exports: SetupCacheSection.
 * Depends on: react, api/{use-setup-cache, describe-error}, components/settings/{config-fields,
 *   form-field, settings-page}, components/ui/{button, confirm-dialog}, domain/format-bytes.
 */

import type { ForgeConfig } from '@forge/core';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useClearSetupCache, useSetupCache } from '#/api/use-setup-cache.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { Notice } from '#/components/settings/form-field.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { formatBytes } from '#/domain/format-bytes.js';
import type { FieldErrors, FieldSetter } from '#/types/settings-fields.types.js';

const LIMIT_FIELD = {
  kind: 'number',
  path: 'engine.setup_cache_gb',
  label: 'Setup cache size limit',
  unit: 'GB',
  hint: 'When the saved copies pass this, the least recently used go first. Applies the next time one is saved.',
} as const;

export function SetupCacheSection(props: {
  config: ForgeConfig;
  errors: FieldErrors;
  onChange: FieldSetter;
}) {
  const size = useSetupCache();
  const clear = useClearSetupCache();
  const [open, setOpen] = useState(false);
  const [withDownloads, setWithDownloads] = useState(false);
  const setup = size.data?.setup_bytes ?? 0;
  const downloads = size.data?.downloads_bytes ?? 0;
  const frees = setup + (withDownloads ? downloads : 0);

  return (
    <SettingsSection
      id="setup-cache"
      title="Setup cache"
      description="Saved copies of installed folders (such as node_modules) and shared package downloads, so a project's next ticket starts in seconds."
    >
      <ConfigFields
        fields={[LIMIT_FIELD]}
        config={props.config}
        errors={props.errors}
        onChange={props.onChange}
      />
      {size.isPending ? (
        <p role="status" className="text-sm text-muted">
          Measuring the cache…
        </p>
      ) : size.isError ? (
        <Notice tone="error" title="Could not read the cache size.">
          {describeError(size.error).detail}{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void size.refetch()}
          >
            Try again
          </button>
        </Notice>
      ) : (
        <p className="text-sm">
          In use: <strong className="font-medium">{formatBytes(setup)}</strong> of saved
          installs of {props.config.engine.setup_cache_gb} GB allowed, and{' '}
          <strong className="font-medium">{formatBytes(downloads)}</strong> of shared
          downloads (these are not limited).
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="quiet"
          disabled={size.isPending || size.isError || setup + downloads === 0}
          status={clear.isPending ? 'loading' : 'idle'}
          onClick={() => {
            setWithDownloads(false);
            setOpen(true);
          }}
        >
          Clear setup cache
        </Button>
        {size.data && setup + downloads === 0 ? (
          <p className="text-xs text-muted">Nothing is saved yet.</p>
        ) : null}
      </div>
      {clear.isSuccess ? (
        <Notice tone="good" title={`Freed ${formatBytes(clear.data.freed_bytes)}.`}>
          The next ticket of each project installs once and saves a copy again.
        </Notice>
      ) : null}
      {clear.isError ? (
        <Notice tone="error" title="Could not clear the setup cache.">
          {describeError(clear.error).detail}
        </Notice>
      ) : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Clear the setup cache?"
        description={`This removes the saved copies of installed folders (${formatBytes(setup)}). The next ticket of each project installs from scratch once, then saves a copy again. Nothing in your projects changes.`}
        confirmLabel={`Clear and free ${formatBytes(frees)}`}
        tone="danger"
        onConfirm={() => clear.mutate({ include_downloads: withDownloads })}
      >
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-signal"
            checked={withDownloads}
            onChange={(event) => setWithDownloads(event.target.checked)}
          />
          <span>
            Also clear shared downloads ({formatBytes(downloads)}). Installs then download
            everything again.
          </span>
        </label>
      </ConfirmDialog>
    </SettingsSection>
  );
}
