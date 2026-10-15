/**
 * StatePanel: the shared look of "loading", "empty" and "something went wrong".
 *
 * Why: every screen has these three states (build plan, "Rules every UI batch follows"), and
 *   a user should recognise them at a glance instead of decoding a new layout per screen.
 *   Loading is a calm skeleton (the shape of what is coming, no spinner theatre), empty says
 *   what will appear and what to do, and error says what failed in plain words with a way to
 *   try again. Errors are announced to screen readers (`role="alert"`), loading is a polite
 *   status.
 *
 * Exports: StatePanel.
 * Depends on: react, lucide-react, components/ui/button.
 */

import { CircleAlert, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';

export function StatePanel(
  props:
    | { kind: 'loading'; label: string }
    | { kind: 'empty'; title: string; children?: ReactNode }
    | {
        kind: 'error';
        title: string;
        detail?: string | undefined;
        onRetry?: (() => void) | undefined;
        retrying?: boolean | undefined;
        children?: ReactNode;
      },
) {
  if (props.kind === 'loading') {
    return (
      <div role="status" aria-label={props.label} className="grid gap-3">
        <div className="h-7 w-48 animate-pulse rounded-md bg-hover" />
        <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-hover" />
        <div className="h-4 w-2/3 max-w-sm animate-pulse rounded-md bg-hover" />
      </div>
    );
  }

  const isError = props.kind === 'error';
  const Icon = isError ? CircleAlert : Inbox;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className="grid max-w-md justify-items-start gap-3 rounded-xl border border-line bg-surface p-5"
    >
      <Icon
        aria-hidden="true"
        className={`size-5 ${isError ? 'text-danger' : 'text-muted'}`}
      />
      <h2 className="text-base font-semibold">{props.title}</h2>
      {isError && props.detail ? (
        <p className="text-sm text-muted">{props.detail}</p>
      ) : null}
      {props.children ? <div className="text-sm text-muted">{props.children}</div> : null}
      {isError && props.onRetry ? (
        <Button onClick={props.onRetry} status={props.retrying ? 'loading' : 'idle'}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
