/**
 * DockItem: one waiting item in the needs-you modal, with the content to act on it in place.
 *
 * Why: the owner opens the alert to decide, not to read a summary. Each item shows its title, the
 *   short reasons it waits, the escalation card or question that carries the real choice (so a
 *   sign-off, a tool approval or a failure is acted on here, with every action it has), at most
 *   one primary and one secondary button, an optional link to the evidence, and in words why the
 *   last action failed. Offline, the buttons are held with the reason, so a press is never lost
 *   silently. The same item shape (`DockView`) serves the Card and the Ticket page.
 *
 * Exports: DockItem.
 * Depends on: react-router, components/ui/button, components/work/dock-reasons,
 *   types/needs-you-dock.types.
 */

import { Link } from 'react-router';
import { Button } from '#/components/ui/button.js';
import { DockReasons } from '#/components/work/dock-reasons.js';
import type { DockActionView, DockView } from '#/types/needs-you-dock.types.js';

const LINK_CLASS =
  'inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-[transform,background-color] duration-150 active:translate-y-px';

function ActionButton(props: {
  action: DockActionView;
  variant: 'primary' | 'quiet';
  held: boolean;
  /** The press opens something else, so the modal steps aside. */
  onLeave: () => void;
}) {
  const { action } = props;

  if (action.to !== undefined) {
    return (
      <Link
        to={action.to}
        onClick={props.onLeave}
        className={`${LINK_CLASS} ${
          props.variant === 'primary'
            ? 'border-transparent bg-signal text-on-signal hover:bg-signal-hi'
            : 'border-line bg-surface text-fg hover:bg-hover'
        }`}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <Button
      variant={props.variant}
      status={action.busy ? 'loading' : 'idle'}
      disabled={props.held}
      aria-expanded={action.expanded}
      onClick={() => {
        action.onRun?.();

        if (action.leaves) {
          props.onLeave();
        }
      }}
    >
      {action.label}
    </Button>
  );
}

export function DockItem(props: {
  view: DockView;
  /** DOM id, so a link in the thread can scroll this item into view. */
  id: string;
  /** Actions are held while Forge is unreachable. */
  held: boolean;
  /** Called when a press opens a page or another dialog, so the modal can close. */
  onLeave: () => void;
}) {
  const { view, held } = props;
  const hasActions =
    view.primary !== undefined || view.secondary !== undefined || view.link !== undefined;

  return (
    <article
      id={props.id}
      aria-labelledby={`${props.id}-title`}
      className="grid min-w-0 gap-3 border-b border-line pb-5 last:border-b-0 last:pb-0"
    >
      <h3 id={`${props.id}-title`} className="break-words text-sm font-semibold">
        {view.title}
      </h3>
      <DockReasons reasons={view.reasons} />
      {view.body === undefined ? null : <div className="min-w-0">{view.body}</div>}
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {view.primary === undefined ? null : (
            <ActionButton
              action={view.primary}
              variant="primary"
              held={held}
              onLeave={props.onLeave}
            />
          )}
          {view.secondary === undefined ? null : (
            <ActionButton
              action={view.secondary}
              variant="quiet"
              held={held}
              onLeave={props.onLeave}
            />
          )}
          {view.link === undefined ? null : (
            <button
              type="button"
              onClick={() => {
                view.link?.onRun();
                props.onLeave();
              }}
              className="min-h-9 rounded-md px-1 text-sm font-medium text-signal underline-offset-2 hover:underline"
            >
              {view.link.label}
            </button>
          )}
        </div>
      ) : null}
      {held ? (
        <p role="status" className="text-xs text-muted">
          You are offline, so actions are held until Forge is reachable.
        </p>
      ) : null}
      {view.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
          {view.error}
        </p>
      ) : null}
    </article>
  );
}
