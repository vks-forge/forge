/**
 * OfflineNotice: the one-line "you are offline" bar shared by the work screens.
 *
 * Why: when the browser has no network, the numbers on screen are the last ones loaded and
 *   writes (archive, mark read) would fail. Saying so up front, in the same words on every
 *   screen, beats a spinner that never ends. It renders nothing while online.
 *
 * Exports: OfflineNotice.
 * Depends on: lucide-react, state/use-online.
 */

import { WifiOff } from 'lucide-react';
import { useOnline } from '#/state/use-online.js';

export function OfflineNotice(props: { children: string }) {
  if (useOnline()) {
    return null;
  }

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm"
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      {props.children}
    </p>
  );
}
