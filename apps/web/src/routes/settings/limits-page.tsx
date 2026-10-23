/**
 * Forge settings, Limits: how many Workers run at once, quota behaviour and spend caps.
 *
 * Why: these dials trade speed against cost and machine load, and the owner reaches for them
 *   when the machine is struggling, when a harness runs dry or when a run costs too much.
 *   Raising a cap takes effect on the Director's next check, so the screen says plainly what each
 *   setting means and that a project can lower its own cap in its project settings. Edits are
 *   saved as a new version with the author and a reason (see `CompanyScreen`).
 *
 * Exports: LimitsPage.
 * Depends on: api/use-settings-data, components/settings/*, domain/settings-fields.
 */

import { Gauge } from 'lucide-react';
import { useHarnesses } from '#/api/use-settings-data.js';
import {
  FallbackOrder,
  HarnessCaps,
  StateCaps,
} from '#/components/settings/cap-lists.js';
import { CompanyScreen } from '#/components/settings/company-screen.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { APPLY_TIMING } from '#/domain/plain-words.js';
import { LIMIT_GROUPS } from '#/domain/settings-fields.js';
import { useCompanySettings } from '#/api/use-settings-data.js';

export function LimitsPage() {
  const harnesses = useHarnesses();
  const saved = useCompanySettings();
  const known = harnesses.data?.harnesses.map((h) => h.id) ?? [];

  return (
    <CompanyScreen
      title="Limits"
      icon={Gauge}
      intro={`Caps on parallel work, what happens when quota runs out, and how much a run may spend. ${APPLY_TIMING}`}
    >
      {(draft, config) => (
        <>
          {LIMIT_GROUPS.map((group) => (
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
              {group.id === 'concurrency' ? (
                <>
                  <HarnessCaps
                    config={config}
                    errors={draft.errors}
                    known={known}
                    onChange={draft.setField}
                  />
                  {saved.data ? (
                    <StateCaps
                      config={config}
                      saved={saved.data.config}
                      errors={draft.errors}
                      onChange={draft.setField}
                    />
                  ) : null}
                </>
              ) : null}
              {group.id === 'quota' ? (
                <FallbackOrder
                  key={`${draft.version}-${draft.dirty}`}
                  config={config}
                  onChange={draft.setField}
                />
              ) : null}
            </SettingsSection>
          ))}
        </>
      )}
    </CompanyScreen>
  );
}
