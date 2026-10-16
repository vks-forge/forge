/**
 * Forge settings, General: where Forge keeps its files, plus timing, Director and model settings.
 *
 * Why: the dials that are not about limits still decide how Forge behaves: how often it looks
 *   for work, how sure the Director must be before acting alone, which model answers each
 *   step, how failed runs are retried. They live here with the same versioned save as Limits.
 *   The data folder is shown but cannot be edited from the UI: it is chosen when Forge is
 *   installed, and moving it means moving files, not changing a setting.
 *
 * Exports: GeneralPage.
 * Depends on: components/settings/*, domain/settings-fields.
 */

import { Folder } from 'lucide-react';
import { CompanyScreen } from '#/components/settings/company-screen.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { GENERAL_GROUPS } from '#/domain/settings-fields.js';

export function GeneralPage() {
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
              Chosen when Forge was installed (on Windows,{' '}
              <code className="font-data text-fg">%LOCALAPPDATA%\Forge</code> unless{' '}
              <code className="font-data text-fg">FORGE_HOME</code> was set). The server
              does not report the exact path to this screen yet, and the folder cannot be
              changed from here.
            </p>
          </SettingsSection>
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
