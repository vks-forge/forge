/**
 * `useInboxPrefs()`: which inbox view (needs action, notices, unread, all, archived) is open.
 *
 * Why: the open view is a view preference, kept behind a `use<Feature>Prefs()` hook so its
 *   storage can change without touching the screen (d-0122). Today it is plain React state and
 *   starts on "Needs action", the one view that is a to-do list rather than a history.
 *
 * Exports: useInboxPrefs().
 * Depends on: react, @forge/core (InboxView type).
 */

import { useState } from 'react';
import type { InboxView } from '@forge/core';

export function useInboxPrefs(): { view: InboxView; setView: (next: InboxView) => void } {
  const [view, setView] = useState<InboxView>('needs_action');

  return { view, setView };
}
