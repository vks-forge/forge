/**
 * NeedsYouPill: a slim alert by the page title that says something waits on the owner, and the
 *   modal that holds everything waiting.
 *
 * Why: the full sign-off, approval or failure block above the message box took the room the chat
 *   needs, and with several items it took most of the page. The alert is one line under the title
 *   ("Needs your sign-off", "Needs your attention · 2") with an Open button; the modal lists the
 *   items newest first, each as the same escalation card or question as before with all its
 *   actions, and scrolls inside itself on a small screen. Closing it answers nothing and it can be
 *   reopened; Escape closes it and focus returns to Open; when the last item is settled the modal
 *   closes itself and the alert goes away (the one-line outcome stays on the page). Keys 1 to 4
 *   press an option of the item in focus. A link in the
 *   Worker thread to one item opens the modal at that item. Nothing waiting draws nothing.
 *
 * Exports: NeedsYouPill.
 * Depends on: react, lucide-react, components/ui/button, components/ui/modal,
 *   components/work/dock-item, domain/needs-you-dock, state/use-bring-to-front,
 *   types/needs-you-dock.types.
 */

import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { Modal } from '#/components/ui/modal.js';
import { DockItem } from '#/components/work/dock-item.js';
import { attentionLabel, newestFirst } from '#/domain/needs-you-dock.js';
import { useBringToFront } from '#/state/use-bring-to-front.js';
import type { DockView } from '#/types/needs-you-dock.types.js';

/**
 * Keys 1 to 4 press that option of a question or approval: in the item that has focus, or in the
 * only item when one waits. Never while typing, and never with a modifier.
 */
function pickOption(
  event: KeyboardEvent,
  section: HTMLElement | null,
  single: boolean,
): void {
  const target = event.target as HTMLElement;
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !/^[1-4]$/.test(event.key) ||
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  ) {
    return;
  }

  const scope = target.closest('article') ?? (single ? section : null);

  scope
    ?.querySelectorAll<HTMLElement>('[data-dock-option]')
    [Number(event.key) - 1]?.click();
}

export function NeedsYouPill(props: { views: readonly DockView[]; online: boolean }) {
  const { views } = props;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const base = useId();
  const count = views.length;
  const labelId = `${base}-label`;
  const list = useRef<HTMLElement>(null);

  // The modal belongs to what waits: with nothing left it closes, and a later arrival starts closed.
  if (count === 0 && open) {
    setOpen(false);
  }

  // The modal holds focus, so the keys are heard on the page while it is open.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent): void =>
      pickOption(event, list.current, count === 1);

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, count]);

  useBringToFront(views, (key) => {
    setTarget(key);
    setOpen(true);
  });

  // The modal draws after this render, so wait for it before scrolling to the named item.
  useEffect(() => {
    if (!open || target === null) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`${base}-${target}`)?.scrollIntoView?.({ block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, target, base]);

  if (count === 0) {
    return null;
  }

  const label = attentionLabel(views.map((view) => view.kind));
  const ordered = newestFirst(views);

  return (
    <>
      <div className="flex min-h-10 min-w-0 shrink-0 items-center gap-2 rounded-xl border border-l-[3px] border-line border-l-attn bg-surface py-1 pl-3 pr-1.5 text-sm">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-attn" />
        <p id={labelId} role="status" className="min-w-0 flex-1 truncate font-medium">
          {label}
        </p>
        <Button
          variant="quiet"
          aria-haspopup="dialog"
          aria-describedby={labelId}
          onClick={() => {
            setTarget(null);
            setOpen(true);
          }}
        >
          Open
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={count > 1 ? `Waiting on you (${count})` : 'Waiting on you'}
        description="Closing this answers nothing. You can open it again from the page."
        primary={null}
        closeLabel="Decide later"
        size="wide"
      >
        <section
          ref={list}
          aria-label={`Waiting on you (${count})`}
          className="grid min-w-0 gap-5"
        >
          {ordered.map((view) => (
            <DockItem
              key={view.key}
              id={`${base}-${view.key}`}
              view={view}
              held={!props.online}
              onLeave={() => setOpen(false)}
            />
          ))}
        </section>
      </Modal>
    </>
  );
}
