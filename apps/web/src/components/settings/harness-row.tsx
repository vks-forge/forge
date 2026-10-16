/**
 * HarnessRow: one installed harness in the list, with what the owner scans for.
 *
 * Why: the first question on this screen is "is my harness OK, and is anything waiting on
 *   me?". Each row answers it in one glance: the harness, its last-tested version, the build
 *   actually installed now (read live, so an update is visible before it breaks a run), how it
 *   signs in, and a status pill. A paused harness (out of quota) shows why and until when.
 *   The whole row is one link to its detail page, a target large enough for a thumb, and
 *   it uses the shared settings row so it lines up with every other list in this area.
 *
 * Exports: HarnessRow.
 * Depends on: react-router, lucide-react, api/use-settings-data, components/settings/settings-box, components/settings/status-pill,
 *   domain/format-time, domain/harness-labels, schemas/settings.
 */

import { ChevronRight, Cpu } from 'lucide-react';
import { Link } from 'react-router';
import { useCompat } from '#/api/use-settings-data.js';
import { SettingsRow } from '#/components/settings/settings-box.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { formatWhen } from '#/domain/format-time.js';
import { harnessName, MODE_WORDS } from '#/domain/harness-labels.js';
import type { HarnessView } from '#/schemas/settings.js';

function Status(props: { harness: HarnessView }) {
  const { harness } = props;
  if (harness.status === 'paused') {
    return <StatusPill tone="attn">Paused</StatusPill>;
  }

  if (harness.status === 'ok') {
    return <StatusPill tone="good">Working</StatusPill>;
  }

  if (harness.status === 'error') {
    return <StatusPill tone="bad">Needs attention</StatusPill>;
  }

  return <StatusPill tone="quiet">Not tested yet</StatusPill>;
}

export function HarnessRow(props: { harness: HarnessView }) {
  const { harness } = props;
  const compat = useCompat(harness.id, true);
  const installed = compat.data?.version ?? undefined;
  const secretMissing =
    harness.auth_mode !== 'login' && !harness.secrets[harness.auth_mode];

  const meta = [
    `Tested ${harness.version ?? 'not yet'}`,
    `Installed ${installed ?? (compat.isPending ? 'reading…' : 'not found')}`,
    MODE_WORDS[harness.auth_mode],
  ].join(' · ');

  const pausedNote = `${harness.pause_reason ?? harness.status_note ?? 'Out of quota.'}${
    harness.paused_until ? ` Resumes ${formatWhen(harness.paused_until)}.` : ''
  }`;

  return (
    <li>
      <Link
        to={`/settings/harnesses/${harness.id}`}
        className="block transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px"
      >
        <SettingsRow
          icon={Cpu}
          name={
            <>
              <span>{harnessName(harness.id)}</span>
              <span className="rounded-md bg-hover px-1.5 font-data text-xs font-normal text-muted">
                {harness.id}
              </span>
              <Status harness={harness} />
              {secretMissing ? (
                <StatusPill tone="attn">No credential stored</StatusPill>
              ) : null}
            </>
          }
          meta={meta}
          note={harness.status === 'paused' ? pausedNote : undefined}
          trailing={<ChevronRight aria-hidden="true" className="size-4 text-faint" />}
        />
      </Link>
    </li>
  );
}
