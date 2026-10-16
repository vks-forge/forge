/**
 * CompanyScreen: the shared frame of the two screens that edit versioned company settings.
 *
 * Why: Limits and General read and write the same versioned document, so they must load,
 *   fail, save, conflict and show history identically. This frame owns those states
 *   (skeleton while loading, a retryable error, the save panel at the foot, the history in
 *   its own section) and hands the screen its draft to render fields from. A new settings
 *   screen only has to list its fields.
 *
 * Exports: CompanyScreen.
 * Depends on: react, lucide-react, api/describe-error, components/settings/*, components/status/state-panel,
 *   state/use-company-draft, types/settings-draft.types.
 */

import type { ForgeConfig } from '@forge/core';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { describeError } from '#/api/describe-error.js';
import { SavePanel } from '#/components/settings/save-panel.js';
import { SettingsPage, SettingsSection } from '#/components/settings/settings-page.js';
import { VersionHistory, VersionSummary } from '#/components/settings/version-history.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { useCompanyDraft } from '#/state/use-company-draft.js';
import type { CompanyDraft } from '#/types/settings-draft.types.js';

export function CompanyScreen(props: {
  title: string;
  intro: string;
  icon: LucideIcon;
  children: (draft: CompanyDraft, config: ForgeConfig) => ReactNode;
}) {
  const draft = useCompanyDraft();

  return (
    <SettingsPage title={props.title} intro={props.intro} icon={props.icon}>
      {draft.status === 'loading' ? (
        <StatePanel kind="loading" label={`Loading ${props.title.toLowerCase()}`} />
      ) : null}
      {draft.status === 'error' ? (
        <StatePanel
          kind="error"
          title={describeError(draft.error).title}
          detail={describeError(draft.error).detail}
          onRetry={draft.retry}
          retrying={draft.retrying}
        />
      ) : null}
      {draft.status === 'ready' && draft.config ? (
        <>
          <VersionSummary version={draft.version} history={draft.history} />
          {props.children(draft, draft.config)}
          <SavePanel draft={draft} />
          <SettingsSection
            id="history"
            title="History"
            description="Every saved version, newest first."
          >
            <VersionHistory history={draft.history} />
          </SettingsSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
