/**
 * BypassField: the "Bypass permissions" switch of one harness, with its warning.
 *
 * Why: with the switch on (the default) Workers on this harness never stop to ask the owner for an
 *   approval, so the owner must see, next to the switch and not behind a help page, what stays
 *   blocked and what does not: Forge's hook still stops secrets, its own data folder, files outside
 *   the ticket's workspace, pushing and destructive commands, but Workers run as the owner's
 *   Windows account, so that is a Forge rule and not an operating-system boundary (d-0183). The
 *   current state is also written out in words, so it never depends on reading a toggle's colour.
 *
 * Exports: BypassField.
 * Depends on: components/ui/field (Switch).
 */

import { Switch } from '#/components/ui/field.js';

const LABEL = 'Bypass permissions';

export function BypassField(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid max-w-xl gap-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{LABEL}</span>
        <span className="flex items-center gap-2 text-sm text-muted">
          {props.checked ? 'On' : 'Off: Workers ask first'}
          <Switch checked={props.checked} onChange={props.onChange} label={LABEL} />
        </span>
      </div>
      <p className="text-sm text-muted">
        Workers run without asking you. Forge still blocks secrets, Forge&apos;s own data
        folder, files outside the ticket&apos;s workspace, pushing and destructive
        commands. Workers run as your Windows account, so this is a Forge rule, not a
        Windows boundary.
      </p>
    </div>
  );
}
