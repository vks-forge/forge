/**
 * Forge settings, one harness: sign-in, credential, test, compatibility and tool approvals.
 *
 * Why: setting up a harness is a sequence (register it, say how it signs in, store the
 *   credential, test it, make sure this build is safe, approve what changed), and the user
 *   should see the whole sequence and the state of each step on one page, top to bottom, with
 *   later steps unavailable until the harness exists. The header answers "is it healthy?"
 *   first: a status badge and a strip of facts (version, sign-in, last test, compatibility)
 *   taken from what the server reports, `—` where it does not. The default harness is usable
 *   before it is registered, so its page opens in a "register it" state instead of an error.
 *
 * Exports: HarnessDetailPage.
 * Depends on: react-router, lucide-react, api/describe-error, api/use-settings-data,
 *   components/settings/*, components/status/state-panel, domain/harness-labels,
 *   domain/relative-time.
 */

import { Cpu, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useCompat, useHarnesses } from '#/api/use-settings-data.js';
import { CompatPanel } from '#/components/settings/compat-panel.js';
import { HarnessSecretForm } from '#/components/settings/harness-secret-form.js';
import { HarnessSetupForm } from '#/components/settings/harness-setup-form.js';
import { HarnessTestPanel } from '#/components/settings/harness-test-panel.js';
import { SettingsSkeleton } from '#/components/settings/settings-card.js';
import { SettingsPage, SettingsSection } from '#/components/settings/settings-page.js';
import { ToolApprovals } from '#/components/settings/tool-approvals.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { harnessName, lastRunWords, MODE_WORDS } from '#/domain/harness-labels.js';
import { timeAgo } from '#/domain/relative-time.js';
import type { CompatView, HarnessView } from '#/schemas/settings.js';
import type { Crumb, HeroBadge, HeroFact } from '#/types/settings-ui.types.js';

/** The harness Forge can use before it is registered (it runs on defaults). */
const DEFAULT_HARNESS = 'claude';

const DOCS: Readonly<Record<string, string>> = {
  claude: 'https://docs.claude.com/en/docs/claude-code/overview',
};

const COMPAT_WORDS: Readonly<Record<CompatView['compat'], string>> = {
  pass: 'Compatible',
  fail: 'Not compatible',
  pending: 'Check pending',
  unknown: 'Not checked',
};

function badgeFor(harness: HarnessView | undefined): HeroBadge {
  if (!harness) {
    return { tone: 'quiet', label: 'Not registered' };
  }

  if (harness.status === 'paused') {
    return { tone: 'attn', label: 'Paused' };
  }

  if (harness.status === 'error') {
    return { tone: 'bad', label: 'Needs attention' };
  }

  if (harness.auth_mode !== 'login' && !harness.secrets[harness.auth_mode]) {
    return { tone: 'attn', label: 'Needs credential' };
  }

  // Runs that really worked count: the live-test button is a separate, optional check.
  return harness.status === 'ok' || harness.last_run?.status === 'success'
    ? { tone: 'good', label: 'Ready' }
    : { tone: 'quiet', label: 'Not tested yet' };
}

function factsFor(
  harness: HarnessView | undefined,
  compat: CompatView | undefined,
): HeroFact[] {
  return [
    { label: 'Version', value: harness?.version ?? '—', mono: true },
    { label: 'Sign-in', value: harness ? MODE_WORDS[harness.auth_mode] : '—' },
    {
      label: 'Last run',
      value: harness
        ? (lastRunWords(harness)?.replace('last run ', '') ?? 'none yet')
        : '—',
    },
    {
      label: 'Live test',
      value: harness?.last_checked_at
        ? timeAgo(harness.last_checked_at, Date.now())
        : 'not run',
    },
    { label: 'Compatibility', value: compat ? COMPAT_WORDS[compat.compat] : '—' },
  ];
}

export function HarnessDetailPage() {
  const { id = '' } = useParams();
  const harnesses = useHarnesses();
  const harness = harnesses.data?.harnesses.find((h) => h.id === id);
  const compat = useCompat(id, harness !== undefined);
  const name = harnessName(id);
  const crumbs: Crumb[] = [
    { label: 'Settings', to: '/settings' },
    { label: 'Harnesses', to: '/settings/harnesses' },
    { label: name },
  ];

  if (harnesses.isPending) {
    return <SettingsSkeleton label="Loading harness" />;
  }

  if (harnesses.isError) {
    return (
      <SettingsPage title={name} intro="" icon={Cpu} crumbs={crumbs}>
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

  if (!harness && id !== DEFAULT_HARNESS) {
    return (
      <SettingsPage
        title="Harness not found"
        intro=""
        icon={Cpu}
        crumbs={[...crumbs.slice(0, 2), { label: 'Not found' }]}
      >
        <StatePanel kind="empty" icon={Cpu} title={`There is no harness called "${id}"`}>
          Pick one from the list.
        </StatePanel>
      </SettingsPage>
    );
  }

  const docs = DOCS[id];
  const tabs = [
    { id: 'signin', label: 'Sign-in' },
    ...(harness
      ? [
          { id: 'credential', label: 'Credential' },
          { id: 'test', label: 'Test' },
          { id: 'compat', label: 'Compatibility' },
          { id: 'tools', label: 'Built-in tools' },
        ]
      : []),
  ];

  return (
    <SettingsPage
      title={name}
      chip={id}
      icon={Cpu}
      crumbs={crumbs}
      badge={badgeFor(harness)}
      facts={factsFor(harness, compat.data)}
      tabs={tabs}
      intro={
        harness
          ? 'Change how this harness signs in, then test it. Changes apply to the next run.'
          : 'This harness is not registered yet. Choose how it signs in and register it; the rest of this page unlocks afterwards.'
      }
      actions={
        <>
          {docs ? (
            <a
              href={docs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors duration-150 hover:bg-hover"
            >
              Docs
              <ExternalLink aria-hidden="true" className="size-3.5 text-muted" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          {harness ? (
            <Link
              to={{ hash: '#test' }}
              replace
              className="inline-flex min-h-9 items-center rounded-lg border border-transparent bg-signal px-3 text-sm font-medium text-on-signal transition-colors duration-150 hover:bg-signal-hi"
            >
              Run test
            </Link>
          ) : null}
        </>
      }
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
