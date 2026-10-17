/**
 * EscalationSetup: something the owner has to fix outside Forge before a ticket can run.
 *
 * Why: a missing login, an unapproved tool or a changed harness build is not a decision the
 *   Director may take for the owner, and retrying cannot help until it is fixed. The card says
 *   what is missing, links straight to the settings page where it is fixed ("Fix in settings"
 *   carries the server's `fix_href`), lets the owner say "I fixed it, check again" (a refusal
 *   explains what is still broken, right here), and promises that the ticket resumes by itself
 *   once Forge sees it fixed, so nobody has to remember to come back.
 *
 * Exports: EscalationSetup, FixLink.
 * Depends on: react-router, lucide-react, types/escalation-ui.types.
 */

import { Settings } from 'lucide-react';
import { Link } from 'react-router';
import type { SetupPayload } from '#/types/escalation-ui.types.js';

/** A same-app path only; anything else (a full URL) is not followed. */
function safeHref(href: string): string {
  return href.startsWith('/') && !href.startsWith('//') ? href : '/settings';
}

/** The link to the settings page that fixes it, drawn as a button-sized link. */
export function FixLink(props: { href: string }) {
  return (
    <Link
      to={safeHref(props.href)}
      className="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent bg-signal px-3 text-sm font-medium text-on-signal transition-[transform,background-color] duration-150 hover:bg-signal-hi active:translate-y-px"
    >
      <Settings aria-hidden="true" className="size-4" />
      Fix in settings
    </Link>
  );
}

export function EscalationSetup(props: { setup: SetupPayload }) {
  return (
    <div className="grid gap-2">
      <p className="min-w-0 whitespace-pre-wrap break-words text-base">
        {props.setup.summary}
      </p>
      <p className="text-sm text-muted">
        The ticket resumes by itself once this is fixed.
      </p>
    </div>
  );
}
