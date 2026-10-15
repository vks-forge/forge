/**
 * TicketLink: the one way to refer to a ticket anywhere in the app.
 *
 * Why: a ticket id in a card, a thread line, a "blocked by" note or a chat reply is only
 *   useful if one click opens the ticket (d-0116). Routing every reference through this
 *   component keeps the URL in one place (domain/ticket-paths.ts) and means a new screen
 *   cannot print a dead id by accident. The project comes from the current URL unless given.
 *
 * Exports: TicketLink.
 * Depends on: react, react-router, domain/ticket-paths.
 */

import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ticketPath } from '#/domain/ticket-paths.js';

export function TicketLink(props: {
  id: string;
  /** Defaults to the project in the current URL. */
  slug?: string;
  className?: string;
  children?: ReactNode;
}) {
  const params = useParams();
  const slug = props.slug ?? params['slug'] ?? '';

  return (
    <Link
      to={ticketPath(slug, props.id)}
      className={`rounded-sm font-medium text-signal underline-offset-2 hover:underline ${props.className ?? ''}`}
    >
      {props.children ?? <span className="font-data">{props.id}</span>}
    </Link>
  );
}
