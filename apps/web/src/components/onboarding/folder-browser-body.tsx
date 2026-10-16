/**
 * FolderBrowserBody: the inside of the folder browser: toolbar, new-folder row, list and actions.
 *
 * Why: the dialog frame and the folder walking are different jobs. This part owns the walk:
 *   the current place and its listing, the sort order, the inline new-folder row, the right-click
 *   menu and what each menu item does (open, select, make a folder inside, copy the path with a
 *   notification, show in Explorer or Finder), and a folder that cannot be opened says why and
 *   offers a way out. Whether the new-folder row is open is held by the dialog so that Esc can
 *   close the row instead of the whole dialog.
 *
 * Exports: FolderBrowserBody.
 * Depends on: lucide-react, react, api/{use-onboarding,describe-error,api-error},
 *   components/onboarding/{folder-list,folder-toolbar,folder-context-menu,new-folder-row}, components/ui/button,
 *   domain/{folder-sort,file-manager}, state/notify/notify-context, types/{folder-browser,onboarding}.types.
 */

import { LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FolderEntry } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import {
  useCreateFolder,
  useFolderListing,
  useRevealFolder,
} from '#/api/use-onboarding.js';
import { FolderContextMenu } from '#/components/onboarding/folder-context-menu.js';
import { FolderList } from '#/components/onboarding/folder-list.js';
import { FolderToolbar } from '#/components/onboarding/folder-toolbar.js';
import { NewFolderRow } from '#/components/onboarding/new-folder-row.js';
import { Button } from '#/components/ui/button.js';
import { fileManagerName } from '#/domain/file-manager.js';
import { sortFolders } from '#/domain/folder-sort.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type { FolderMenuTarget } from '#/types/folder-browser.types.js';
import type { FolderSort } from '#/types/onboarding.types.js';

const ABSOLUTE = /^([A-Za-z]:[\\/]|\\\\|\/)/;

/** What went wrong in words that say what to do; a missing or locked folder is not "Forge reported a problem". */
function explain(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.status === 404) {
      return {
        title: 'That folder does not exist',
        detail: 'Pick another place to start from.',
      };
    }

    if (error.status === 400 && error.code === 'not_a_directory') {
      return { title: 'That is a file, not a folder', detail: 'Pick a folder instead.' };
    }

    if (error.code === 'folder_not_readable') {
      return {
        title: 'Forge is not allowed to open that folder',
        detail: 'Go back up and choose another one.',
      };
    }
  }

  return describeError(error);
}

export function FolderBrowserBody(props: {
  start: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
  /** The new-folder row is open. */
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
}) {
  const { creating, onCreatingChange } = props;
  const [path, setPath] = useState(
    ABSOLUTE.test(props.start.trim()) ? props.start.trim() : '',
  );

  const [sort, setSort] = useState<FolderSort>('name_asc');
  const [menu, setMenu] = useState<FolderMenuTarget | null>(null);
  const [made, setMade] = useState<string | undefined>(undefined);
  const notify = useNotify();
  const createFolder = useCreateFolder();
  const revealFolder = useRevealFolder();
  const listing = useFolderListing(path, true);
  const data = listing.data;
  const here = data?.path ?? '';

  const entries = useMemo(
    () => (data ? (here === '' ? data.entries : sortFolders(data.entries, sort)) : []),
    [data, here, sort],
  );

  const go = (next: string, makeFolder = false): void => {
    setPath(next);
    onCreatingChange(makeFolder);
    setMade(undefined);
  };

  const copy = async (entry: FolderEntry): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.path);
      notify.success('Path copied', { description: entry.path });
    } catch {
      notify.error('Could not copy the path', {
        description: 'Your browser did not allow clipboard access.',
      });
    }
  };

  const reveal = (entry: FolderEntry): void => {
    revealFolder.mutate(entry.path, {
      onSuccess(result) {
        if (result.status === 'unavailable') {
          notify.error(`Could not open ${fileManagerName()}`, {
            description: result.reason,
          });
        }
      },
      onError(error) {
        notify.error(`Could not open ${fileManagerName()}`, {
          description: describeError(error).title,
        });
      },
    });
  };

  return (
    <>
      <FolderToolbar
        where={
          listing.isError
            ? 'Could not open'
            : here === '' && data
              ? 'This computer'
              : here
        }
        canGoUp={Boolean(data) && here !== ''}
        onUp={() => go(data?.parent ?? '')}
        sort={sort}
        onSort={setSort}
        canCreate={Boolean(data) && here !== ''}
        onNewFolder={() => onCreatingChange(!creating)}
      />
      {creating && data && here !== '' ? (
        <NewFolderRow
          existing={data.entries.map((e) => e.name)}
          onCancel={() => onCreatingChange(false)}
          onCreate={async (name) => {
            const entry = await createFolder.mutateAsync({ parent: here, name });

            notify.success('Folder created', { description: entry.name });
            onCreatingChange(false);
            setMade(entry.path);
          }}
        />
      ) : null}
      {listing.isPending ? (
        <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Reading folders…
        </p>
      ) : listing.isError ? (
        <div role="alert" className="grid gap-2 rounded-lg border border-danger p-4">
          <p className="text-sm font-medium text-danger">
            {explain(listing.error).title}
          </p>
          <p className="text-sm text-muted">{explain(listing.error).detail}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void listing.refetch()}>Try again</Button>
            <Button onClick={() => go('')}>Show drives and home</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {entries.length === 0 ? (
            <p className="py-6 text-sm text-muted">
              There are no folders inside this one.
              {here !== '' ? ' Use New folder to make one.' : ''}
            </p>
          ) : (
            <FolderList
              key={here}
              label={here === '' ? 'Places to start from' : `Folders in ${here}`}
              entries={entries}
              reveal={made}
              onOpen={(entry) => go(entry.path)}
              onUp={() => {
                if (here !== '') {
                  go(listing.data.parent ?? '');
                }
              }}
              onMenu={(entry, x, y) => setMenu({ entry, x, y })}
            />
          )}
          {listing.data.truncated ? (
            <p className="text-xs text-muted">
              Only the first {listing.data.entries.length} folders are shown. Use New
              folder or open a folder to go deeper.
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button variant="quiet" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!data || here === ''}
          onClick={() => props.onSelect(here)}
        >
          Select this folder
        </Button>
      </div>
      <FolderContextMenu
        target={menu}
        onClose={() => setMenu(null)}
        onOpen={(entry) => go(entry.path)}
        onSelect={(entry) => props.onSelect(entry.path)}
        onNewInside={(entry) => go(entry.path, true)}
        onCopy={(entry) => void copy(entry)}
        onReveal={reveal}
      />
    </>
  );
}
