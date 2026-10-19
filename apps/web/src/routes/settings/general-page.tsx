/**
 * Forge settings, General: where Forge keeps its files, plus timing, Director and model settings.
 *
 * Why: the dials that are not about limits still decide how Forge behaves: how often it looks
 *   for work, how sure the Director must be before acting alone, which model answers each
 *   step, how failed runs are retried. They live here with the same versioned save as Limits.
 *   The data folder is shown but cannot be edited: it is always the platform default
 *   (d-0170), and moving it would mean moving files, not changing a setting.
 *
 * Exports: GeneralPage.
 * Depends on: api/use-onboarding, components/settings/* (incl. the per-browser desktop-notification switch),
 *   domain/settings-fields.
 */

import { Folder } from 'lucide-react';
import { useSystem } from '#/api/use-onboarding.js';
import { BrowserNotifySetting } from '#/components/settings/browser-notify-setting.js';
import { CompanyScreen } from '#/components/settings/company-screen.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { GENERAL_GROUPS } from '#/domain/settings-fields.js';

export function GeneralPage() {
  const system = useSystem();

  return (
    <CompanyScreen
      title="General"
      icon={Folder}
      intro="How Forge paces itself and which models it uses. Changes apply on the Director's next tick."
    >
      {(draft, config) => (
        <>
          <SettingsSection
            id="data-folder"
            title="Data folder"
            description="Where Forge keeps its database, secrets and worktrees."
          >
            <p className="text-sm text-muted">
              {system.data ? (
                <code
                  aria-label="Data folder"
                  className="select-all break-all font-data text-fg"
                >
                  {system.data.data_home}
                </code>
              ) : (
                <code className="font-data text-fg">%LOCALAPPDATA%\Forge</code>
              )}{' '}
              is fixed: Forge always keeps its files there, and it is not a repository
              folder. Forge does not move existing data.
            </p>
          </SettingsSection>
          <BrowserNotifySetting />
          {GENERAL_GROUPS.map((group) => (
            <SettingsSection
              key={group.id}
              id={group.id}
              title={group.title}
              description={group.description}
            >
              <ConfigFields
                fields={group.fields}
                config={config}
                errors={draft.errors}
                onChange={draft.setField}
              />
            </SettingsSection>
          ))}
        </>
      )}
    </CompanyScreen>
  );
}
