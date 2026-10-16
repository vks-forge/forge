/**
 * InboxRow: one inbox item with the way to its source and its read and archive controls.
 *
 * Why: an inbox item is "something happened, here is where to deal with it". The title links
 *   to the ticket, run, memory record or harness it is about; unread items are heavier and
 *   carry a dot (a shape, not just colour); the controls are icon buttons each named with the
 *   item so a screen reader hears "Archive: Worker asks about migrations". Controls are 44 px
 *   on a phone. They are held while offline, because a mark that cannot be saved would only
 *   bounce back.
 *
 * Exports: InboxRow, INBOX_ROW_HEIGHT.
 * Depends on: react-router, lucide-react, @forge/core (type), components/inbox/kind-chip, components/ui/tooltip,
 *   domain/inbox-links, domain/format-time, types/work-api.types.
 */

import { Archive, ArchiveRestore, Mail, MailOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { InboxItem } from '@forge/core';
import { KindChip } from '#/components/inbox/kind-chip.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { formatWhen } from '#/domain/format-time.js';
import { inboxLink } from '#/domain/inbox-links.js';
import type { InboxMarkName } from '#/types/work-api.types.js';

export const INBOX_ROW_HEIGHT = 84;

/** Memory proposals carry no timestamp and arrive dated at the epoch; showing "Jan 1, 1970" would mislead. */
const hasTime = (iso: string): boolean => Date.parse(iso) > 0;

function IconButton(props: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={props.label}>
      <button
        type="button"
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
        className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-fg active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 sm:size-9"
      >
        {props.children}
      </button>
    </Tooltip>
  );
}

export function InboxRow(props: {
  slug: string;
  item: InboxItem;
  onMark: (item: InboxItem, mark: InboxMarkName) => void;
  marksDisabled: boolean;
}) {
  const { item } = props;
  const link = inboxLink(props.slug, item);

  return (
    <div className="flex h-full items-center gap-2 border-b border-line px-1 hover:bg-hover/50">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-signal'}`}
      />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <KindChip item={item} />
          <Link
            to={link.to}
            aria-label={`${link.label}: ${item.title}`}
            className={`min-w-0 truncate text-sm hover:underline ${item.read ? '' : 'font-semibold'}`}
          >
            {item.title}
          </Link>
        </div>
        <p className="truncate text-xs text-muted">
          {[item.detail, hasTime(item.updated_at) ? formatWhen(item.updated_at) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {item.read ? (
        <IconButton
          label={`Mark unread: ${item.title}`}
          disabled={props.marksDisabled}
          onClick={() => props.onMark(item, 'unread')}
        >
          <Mail aria-hidden="true" className="size-4" />
        </IconButton>
      ) : (
        <IconButton
          label={`Mark read: ${item.title}`}
          disabled={props.marksDisabled}
          onClick={() => props.onMark(item, 'read')}
        >
          <MailOpen aria-hidden="true" className="size-4" />
        </IconButton>
      )}
      {item.archived ? (
        <IconButton
          label={`Unarchive: ${item.title}`}
          disabled={props.marksDisabled}
          onClick={() => props.onMark(item, 'unarchive')}
        >
          <ArchiveRestore aria-hidden="true" className="size-4" />
        </IconButton>
      ) : (
        <IconButton
          label={`Archive: ${item.title}`}
          disabled={props.marksDisabled}
          onClick={() => props.onMark(item, 'archive')}
        >
          <Archive aria-hidden="true" className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
