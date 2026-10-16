/**
 * NewFolderRow: the inline "name the new folder" row at the top of the folder list.
 *
 * Why: the folder a person wants often does not exist yet, and the browser is where they find
 *   out. Naming it in place, in the folder they are looking at, beats a separate dialog:
 *   Enter creates, Esc cancels, and a name the server would refuse (separators, Windows reserved
 *   names, a name already there) is explained under the box while they type, in plain words with
 *   the fix. The server's own refusal (a 409 race, a read-only parent) lands in the same place.
 *   While the request is in flight the box is locked, so a double Enter cannot make two.
 *
 * Exports: NewFolderRow.
 * Depends on: lucide-react, react, api/{api-error,describe-error}, components/ui/button, domain/folder-name.
 */

import { CircleAlert, FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { Button } from '#/components/ui/button.js';
import { folderNameProblem } from '#/domain/folder-name.js';

function explainCreate(error: unknown, name: string): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'folder_exists') {
      return `${name} already exists here.`;
    }

    if (error.code === 'invalid_folder_name') {
      return error.message;
    }

    if (error.code === 'folder_not_writable') {
      return 'Forge is not allowed to create folders here. Choose another place.';
    }
  }

  const { title, detail } = describeError(error);

  return `${title}. ${detail}`;
}

export function NewFolderRow(props: {
  /** Names already in the folder, to catch a duplicate while typing. */
  existing: readonly string[];
  /** Creates the folder; resolves when it exists, rejects with the server's refusal. */
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = folderNameProblem(name, props.existing);
  const shown = refusal ?? (touched ? problem : null);

  const submit = async (): Promise<void> => {
    if (busy) {
      return;
    }

    setTouched(true);
    if (problem !== null) {
      return;
    }

    setBusy(true);
    try {
      await props.onCreate(name);
    } catch (error) {
      setRefusal(explainCreate(error, name));
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-1.5 rounded-lg border border-signal bg-signal-soft p-2">
      <div className="flex items-center gap-2">
        <FolderPlus aria-hidden="true" className="size-4 shrink-0 text-signal" />
        <input
          autoFocus
          aria-label="New folder name"
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? 'new-folder-error' : undefined}
          value={name}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          placeholder="New folder name"
          onChange={(event) => {
            setName(event.target.value);
            setTouched(true);
            setRefusal(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              props.onCancel();
            }
          }}
          className="min-h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm aria-[invalid=true]:border-danger"
        />
        <Button
          variant="primary"
          onClick={() => void submit()}
          status={busy ? 'loading' : 'idle'}
          disabled={touched && problem !== null}
        >
          Create
        </Button>
        <Button variant="quiet" onClick={props.onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      {shown ? (
        <p
          id="new-folder-error"
          role="alert"
          className="flex items-center gap-1.5 pl-6 text-xs text-danger"
        >
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {shown}
        </p>
      ) : null}
    </div>
  );
}
