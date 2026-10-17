/**
 * Forge settings, Harnesses: the coding harnesses Forge runs Workers on.
 *
 * Why: nothing runs until a harness is registered, signed in and verified, so this is the
 *   first settings screen a new user needs and the one an experienced user returns to when a
 *   run fails on auth or quota. It lists what is registered with its health; an empty list
 *   says how to start instead of showing a blank page.
 *
 * Exports: HarnessesPage.
 * Depends on: react-router, api/describe-error, api/use-settings-data, components/settings/*,
 *   components/status/state-panel, components/ui/button.
 */

import { Cpu } from 'lucide-react';
import { Link } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useHarnesses } from '#/api/use-settings-data.js';
import { HarnessRow } from '#/components/settings/harness-row.js';
import { BoxEmpty, SettingsBox } from '#/components/settings/settings-box.js';
import { SettingsPage } from '#/components/settings/settings-page.js';
import { StatePanel } from '#/components/status/state-panel.js';

export function HarnessesPage() {
  const harnesses = useHarnesses();

  return (
    <SettingsPage
      title="Harnesses"
      icon={Cpu}
      intro="The command-line tools Forge runs Workers and the Director on. Pick how each signs in, check it works, and approve changes to its built-in tools."
    >
      <SettingsBox
        title="Registered harnesses"
        count={harnesses.isSuccess ? harnesses.data.harnesses.length : undefined}
      >
        {harnesses.isPending ? (
          <div className="p-4">
            <StatePanel kind="loading" label="Loading harnesses" />
          </div>
        ) : null}
        {harnesses.isError ? (
          <div className="p-4">
            <StatePanel
              kind="error"
              title={describeError(harnesses.error).title}
              detail={describeError(harnesses.error).detail}
              onRetry={() => void harnesses.refetch()}
              retrying={harnesses.isFetching}
            />
          </div>
        ) : null}
        {harnesses.isSuccess && harnesses.data.harnesses.length === 0 ? (
          <BoxEmpty icon={Cpu} title="No harness is set up yet">
            <p>
              Forge needs one to run Workers.{' '}
              <Link
                className="font-medium text-signal underline underline-offset-2"
                to="/settings/harnesses/claude"
              >
                Set up Claude Code
              </Link>
              .
            </p>
          </BoxEmpty>
        ) : null}
        {harnesses.isSuccess && harnesses.data.harnesses.length > 0 ? (
          <ul aria-label="Harnesses" className="divide-y divide-line">
            {harnesses.data.harnesses.map((harness) => (
              <HarnessRow key={harness.id} harness={harness} />
            ))}
          </ul>
        ) : null}
      </SettingsBox>
      {harnesses.isSuccess
        ? harnesses.data.paused
            .filter((p) => !harnesses.data.harnesses.some((h) => h.id === p.harness_id))
            .map((p) => (
              <p key={p.harness_id} className="text-sm text-muted">
                {p.harness_id} is paused: {p.reason}
              </p>
            ))
        : null}
    </SettingsPage>
  );
}
