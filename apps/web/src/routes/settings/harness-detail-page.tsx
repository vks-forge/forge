/**
 * Forge settings, one harness: sign-in, credential, test, compatibility and tool approvals.
 *
 * Why: setting up a harness is a sequence (register it, say how it signs in, store the
 *   credential, test it, make sure this build is safe, approve what changed), and the user
 *   should see the whole sequence and the state of each step on one page, top to bottom, with
 *   later steps unavailable until the harness exists. The default harness is usable before it
 *   is registered, so its page opens in a "register it" state instead of an error.
 *
 * Exports: HarnessDetailPage.
 * Depends on: react-router, api/describe-error, api/use-settings-data, components/settings/*,
 *   components/status/state-panel.
 */

import { useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useHarnesses } from '#/api/use-settings-data.js';
import { CompatPanel } from '#/components/settings/compat-panel.js';
import { HarnessSecretForm } from '#/components/settings/harness-secret-form.js';
import { HarnessSetupForm } from '#/components/settings/harness-setup-form.js';
import { HarnessTestPanel } from '#/components/settings/harness-test-panel.js';
import { SettingsPage, SettingsSection } from '#/components/settings/settings-page.js';
import { ToolApprovals } from '#/components/settings/tool-approvals.js';
import { StatePanel } from '#/components/status/state-panel.js';

/** The harness Forge can use before it is registered (it runs on defaults). */
const DEFAULT_HARNESS = 'claude';

export function HarnessDetailPage() {
  const { id = '' } = useParams();
  const harnesses = useHarnesses();
  const back = { to: '/settings/harnesses', label: 'All harnesses' };

  if (harnesses.isPending) {
    return (
      <SettingsPage title={id} intro="Loading…" back={back}>
        <StatePanel kind="loading" label="Loading harness" />
      </SettingsPage>
    );
  }

  if (harnesses.isError) {
    return (
      <SettingsPage title={id} intro="" back={back}>
        <StatePanel
          kind="error"
          title={describeError(harnesses.error).title}
          detail={describeError(harnesses.error).detail}
          onRetry={() => void harnesses.refetch()}
          retrying={harnesses.isFetching}
        />
      </SettingsPage>
    );
  }

  const harness = harnesses.data.harnesses.find((h) => h.id === id);
  if (!harness && id !== DEFAULT_HARNESS) {
    return (
      <SettingsPage title="Harness not found" intro="" back={back}>
        <StatePanel kind="empty" title={`There is no harness called "${id}"`}>
          Pick one from the list.
        </StatePanel>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title={id}
      intro={
        harness
          ? 'Change how this harness signs in, then test it. Changes apply to the next run.'
          : 'This harness is not registered yet. Choose how it signs in and register it; the rest of this page unlocks afterwards.'
      }
      back={back}
    >
      <SettingsSection
        id="signin"
        title="Sign-in"
        description="Where the executable is and which account or key it uses."
      >
        <HarnessSetupForm key={harness ? 'saved' : 'new'} id={id} harness={harness} />
      </SettingsSection>
      {harness ? (
        <>
          <SettingsSection
            id="credential"
            title="Credential"
            description="Write-only. Forge never shows a stored key or token."
          >
            <HarnessSecretForm key={`${harness.auth_mode}`} harness={harness} />
          </SettingsSection>
          <SettingsSection
            id="test"
            title="Test"
            description="Checks the executable, the version and the sign-in."
          >
            <HarnessTestPanel id={id} />
          </SettingsSection>
          <SettingsSection
            id="compat"
            title="Compatibility"
            description="Forge only runs Workers on a build it has verified."
          >
            <CompatPanel id={id} />
          </SettingsSection>
          <SettingsSection
            id="tools"
            title="Built-in tools"
            description="Approve or deny tools whose schema changed with an update."
          >
            <ToolApprovals id={id} />
          </SettingsSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
