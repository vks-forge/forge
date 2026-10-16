/**
 * FolderList: the keyboard-driven list of sub-folders inside the folder browser.
 *
 * Why: choosing a folder is a walk down a tree, and people do it with the mouse or with the
 *   keyboard alone. This is one real listbox (a single tab stop, arrows move, Home and End
 *   jump, Enter or Right opens, Left or Backspace goes up, the menu key or Shift+F10 opens the
 *   folder's menu), so a screen reader hears "list, 12 items" and a keyboard user never tabs
 *   through hundreds of rows. Text selection is off for the whole list: opening a folder with a
 *   double-click used to highlight every name, which looked broken and got in the way. A folder
 *   that is a git repository is marked with an icon and the words "Git repository", never by
 *   colour alone, because that mark tells a person they have found their project. Each row
 *   shows when the folder last changed, which is what the date sort orders by.
 *
 * Exports: FolderList.
 * Depends on: lucide-react, react, @forge/core (FolderEntry, type), domain/format-time.
 */

import { Folder, GitBranch } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { FolderEntry } from '@forge/core';
import { formatWhen } from '#/domain/format-time.js';

export function FolderList(props: {
  /** Names the list for assistive technology, e.g. the current folder. */
  label: string;
  entries: readonly FolderEntry[];
  onOpen: (entry: FolderEntry) => void;
  onUp: () => void;
  /** Open the folder's menu at screen position (x, y). */
  onMenu: (entry: FolderEntry, x: number, y: number) => void;
  /** A folder just made: select it and put the keyboard on it. */
  reveal?: string | undefined;
}) {
  const { entries, reveal } = props;
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(entries.length - 1, 0));

  // The browser mounts a fresh list (keyed by folder) per folder: start at the top with the keyboard on it.
  useEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  // A folder just made: select it as soon as the refreshed list holds it (state adjusted while rendering).
  const [shownReveal, setShownReveal] = useState<string | undefined>(undefined);
  const revealAt = reveal ? entries.findIndex((e) => e.path === reveal) : -1;

  if (reveal !== shownReveal && revealAt >= 0) {
    setShownReveal(reveal);
    setActive(revealAt);
  }

  useEffect(() => {
    if (shownReveal) {
      listRef.current?.focus({ preventScroll: true });
    }
  }, [shownReveal]);

  useEffect(() => {
    document
      .getElementById(`${listId}-${current}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [current, listId]);

  function openMenuForActive(): void {
    const entry = entries[current];
    const row = document.getElementById(`${listId}-${current}`);

    if (entry && row) {
      const box = row.getBoundingClientRect();

      props.onMenu(entry, box.left + 32, box.bottom);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = entries.length - 1;
    const open = entries[current];

    if (event.key === 'ArrowDown') {
      setActive(Math.min(current + 1, last));
    } else if (event.key === 'ArrowUp') {
      setActive(Math.max(current - 1, 0));
    } else if (event.key === 'Home') {
      setActive(0);
    } else if (event.key === 'End') {
      setActive(Math.max(last, 0));
    } else if ((event.key === 'Enter' || event.key === 'ArrowRight') && open) {
      props.onOpen(open);
    } else if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
      props.onUp();
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      openMenuForActive();
    } else {
      return;
    }

    event.preventDefault();
  }

  function onContextMenu(
    event: MouseEvent<HTMLLIElement>,
    entry: FolderEntry,
    index: number,
  ) {
    event.preventDefault();
    setActive(index);
    props.onMenu(entry, event.clientX, event.clientY);
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label={props.label}
      aria-activedescendant={entries.length > 0 ? `${listId}-${current}` : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="grid max-h-[min(22rem,45vh)] select-none overflow-y-auto rounded-lg border border-line p-1"
    >
      {entries.map((entry, index) => (
        <li
          key={entry.path}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === current}
          onClick={() => setActive(index)}
          onDoubleClick={() => props.onOpen(entry)}
          onContextMenu={(event) => onContextMenu(event, entry, index)}
          className="flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm aria-selected:bg-hover"
        >
          <Folder aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {entry.is_repo ? (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-good">
              <GitBranch aria-hidden="true" className="size-3.5" />
              Git repository
            </span>
          ) : null}
          {entry.modified_at ? (
            <span className="hidden shrink-0 text-xs text-muted sm:inline">
              {formatWhen(entry.modified_at)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
