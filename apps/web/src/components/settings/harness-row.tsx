/**
 * HarnessRow: one installed harness in the list, with what the owner scans for.
 *
 * Why: the first question on this screen is "is my harness OK, and is anything waiting on
 *   me?". Each row answers it in one glance: the harness, its last-tested version, the build
 *   actually installed now (read live, so an update is visible before it breaks a run), how it
 *   signs in, and a status pill. A paused harness (out of quota) shows why and until when.
 *   The whole row is one link to its detail page, a target large enough for a thumb.
 *
 * Exports: HarnessRow.
 * Depends on: react-router, lucide-react, api/use-settings-data, components/settings/status-pill,
 *   domain/format-time, schemas/settings.
 */

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useCompat } from '#/api/use-settings-data.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { formatWhen } from '#/domain/format-time.js';
import type { HarnessView } from '#/schemas/settings.js';

const MODE_WORDS = {
  login: 'Signed-in account',
  api_key: 'API key',
  oauth_token: 'OAuth token',
} as const;

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

  const facts: [string, string][] = [
    ['Tested version', harness.version ?? 'Not tested'],
    ['Installed build', installed ?? (compat.isPending ? 'Reading…' : 'Not found')],
    ['Sign-in', MODE_WORDS[harness.auth_mode]],
  ];

  return (
    <li>
      <Link
        to={`/settings/harnesses/${harness.id}`}
        className="grid gap-3 rounded-xl border border-line bg-surface p-4 transition-[background-color,border-color,transform] duration-150 hover:border-faint hover:bg-hover active:translate-y-px"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{harness.id}</span>
          <Status harness={harness} />
          {secretMissing ? (
            <StatusPill tone="attn">No credential stored</StatusPill>
          ) : null}
          <ChevronRight aria-hidden="true" className="ml-auto size-4 text-faint" />
        </span>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-xs text-faint">{label}</dt>
              <dd className="font-data text-xs break-all">{value}</dd>
            </div>
          ))}
        </dl>
        {harness.status === 'paused' ? (
          <p className="text-sm text-muted">
            {harness.pause_reason ?? harness.status_note ?? 'Out of quota.'}
            {harness.paused_until ? ` Resumes ${formatWhen(harness.paused_until)}.` : ''}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
