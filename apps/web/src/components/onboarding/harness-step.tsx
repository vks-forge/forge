/**
 * HarnessStep: step 1, register the `claude` harness, store a credential if needed, test it.
 *
 * Why: Workers run the Claude Code the person already installed (d-0087), and a wrong path or
 *   a signed-out account would otherwise fail the first ticket hours later. This step reuses
 *   the Forge settings forms, so what is learned here is what Settings shows later: how it
 *   signs in, the write-only credential, and a test that is free by default. The optional real
 *   model call is an unticked box that says it costs a little. A harness that already passed
 *   shows as working, so a resumed wizard does not ask again.
 *
 * Exports: HarnessStep.
 * Depends on: api/describe-error, api/use-settings-data, components/settings/*,
 *   components/status/state-panel.
 */

import type { ReactNode } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useHarnesses } from '#/api/use-settings-data.js';
import { HarnessSecretForm } from '#/components/settings/harness-secret-form.js';
import { HarnessSetupForm } from '#/components/settings/harness-setup-form.js';
import { HarnessTestPanel } from '#/components/settings/harness-test-panel.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { StatePanel } from '#/components/status/state-panel.js';

/** The harness Forge runs Workers on today. */
const HARNESS_ID = 'claude';

function Part(props: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line pt-5">
      <h2 className="text-base font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}

export function HarnessStep() {
  const harnesses = useHarnesses();

  if (harnesses.isPending) {
    return <StatePanel kind="loading" label="Loading harnesses" />;
  }

  if (harnesses.isError) {
    const { title, detail } = describeError(harnesses.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void harnesses.refetch()}
        retrying={harnesses.isFetching}
      />
    );
  }

  const harness = harnesses.data.harnesses.find((h) => h.id === HARNESS_ID);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{HARNESS_ID}</span>
        {harness?.status === 'ok' ? (
          <StatusPill tone="good">Working</StatusPill>
        ) : harness ? (
          <StatusPill tone="quiet">Not tested yet</StatusPill>
        ) : (
          <StatusPill tone="quiet">Not registered yet</StatusPill>
        )}
      </div>
      <Part title="How it signs in">
        <HarnessSetupForm
          key={harness ? 'saved' : 'new'}
          id={HARNESS_ID}
          harness={harness}
        />
      </Part>
      {harness ? (
        <>
          <Part title="Credential">
            <HarnessSecretForm key={harness.auth_mode} harness={harness} />
          </Part>
          <Part title="Test">
            <HarnessTestPanel id={HARNESS_ID} />
          </Part>
        </>
      ) : null}
      <p className="max-w-prose text-sm text-muted">
        You can continue without testing and do it later under Forge settings, Harnesses.
        Tickets will not run until a harness works.
      </p>
    </div>
  );
}
