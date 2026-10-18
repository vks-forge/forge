/**
 * `useKeptEscalations()`: a ticket's escalations, with the ones just settled kept on screen.
 *
 * Why: the server lists only pending escalations, so one the owner settles by a click vanishes
 *   from the ticket before they have read "Signed off by you" or "Merged anyway by you". The Ticket
 *   page draws escalations in two places (the answer panel above the tabs, the Review tab for
 *   held and sign-off items), so the kept items live here, once, and both read the same list:
 *   an item the owner settled stays drawn, as its one-line settled card, wherever it was.
 *
 * Exports: useKeptEscalations().
 * Depends on: react, schemas/escalation (type).
 */

import { useCallback, useState } from 'react';
import type { EscalationView } from '#/schemas/escalation.js';

export function useKeptEscalations(listed: readonly EscalationView[]): {
  shown: readonly EscalationView[];
  keep: (view: EscalationView) => void;
} {
  const [kept, setKept] = useState<ReadonlyMap<string, EscalationView>>(new Map());
  const keep = useCallback(
    (view: EscalationView) =>
      setKept((held) =>
        held.get(view.id) === view ? held : new Map(held).set(view.id, view),
      ),
    [],
  );

  const ids = new Set(listed.map((item) => item.id));
  const shown = [
    ...listed.map((item) => kept.get(item.id) ?? item),
    ...[...kept.values()].filter((item) => !ids.has(item.id)),
  ];

  return { shown, keep };
}
