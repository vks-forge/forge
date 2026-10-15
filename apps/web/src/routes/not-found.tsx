/**
 * NotFound: the page for a URL that matches no screen.
 *
 * Why: a typo or an old bookmark should land on a sentence that says what happened and a link
 *   that fixes it, not a blank frame. The sidebar stays, so the user can also navigate away.
 *
 * Exports: NotFound.
 * Depends on: react-router, components/status/state-panel.
 */

import { Link } from 'react-router';
import { StatePanel } from '#/components/status/state-panel.js';

export function NotFound() {
  return (
    <StatePanel kind="empty" title="This page does not exist">
      <Link className="font-medium text-signal underline" to="/">
        Go to your project
      </Link>
    </StatePanel>
  );
}
