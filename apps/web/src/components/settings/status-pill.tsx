/**
 * StatusPill: a short word and icon for the state of a harness, check, tool or connection.
 *
 * Why: the same few states (ok, needs you, failed, unknown) appear on every settings screen
 *   and must look the same each time. Amber is reserved for what needs the user, red for what
 *   is broken, green for working, grey for not known yet. Each state pairs its colour with an
 *   icon and a word, so it never relies on colour alone.
 *
 * Exports: StatusPill.
 * Depends on: react, lucide-react, types/settings-ui.types.
 */

import { Check, CircleAlert, CircleHelp, Clock } from 'lucide-react';
import type { PillTone } from '#/types/settings-ui.types.js';

const STYLES = {
  good: { icon: Check, cls: 'text-good border-good' },
  attn: { icon: Clock, cls: 'text-attn border-attn bg-attn-soft' },
  bad: { icon: CircleAlert, cls: 'text-danger border-danger bg-danger-soft' },
  quiet: { icon: CircleHelp, cls: 'text-muted border-line' },
} as const;

export function StatusPill(props: { tone: PillTone; children: string }) {
  const { icon: Icon, cls } = STYLES[props.tone];

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon aria-hidden="true" className="size-3" />
      {props.children}
    </span>
  );
}
