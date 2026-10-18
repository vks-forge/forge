/**
 * Forge settings, Director: how the Director plans, which model runs each step, and its limits.
 *
 * Why: the Director turns a card into a reviewed plan before any ticket exists, and how it does
 *   that is the owner's to shape (d-0146, d-0150): which model runs each step, the standing
 *   house rules, whether it may approve a plan itself, how many questions it asks, when to
 *   warn about spend, and the ordered flow of steps. Everything saves as one numbered version
 *   with the other company settings, so each Director step can record which version it used
 *   and a bad edit is one Reset away. What no setting can change (the approval floor, the Tier
 *   C human, the tool-less approval step) is listed greyed with its reason, so the limits of
 *   the page are as visible as its controls.
 *
 * Exports: DirectorPage.
 * Depends on: lucide-react, api/use-settings-data, components/director/*,
 *   components/settings/*, domain/director-settings.
 */

import { Workflow } from 'lucide-react';
import { useCompanySettings } from '#/api/use-settings-data.js';
import { DirectorStatus } from '#/components/director/director-status.js';
import { FlowEditor } from '#/components/director/flow-editor.js';
import { LockedRules, PlaybooksView } from '#/components/director/locked-rules.js';
import { ModelFields } from '#/components/director/model-fields.js';
import {
  ApprovalField,
  HouseRulesField,
  SignOffField,
} from '#/components/director/rules-fields.js';
import { CompanyScreen } from '#/components/settings/company-screen.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { SettingsSection } from '#/components/settings/settings-page.js';
import { MEMORY_REJECTED_NOTE } from '#/domain/director-memory-fields.js';
import { DIRECTOR_FIELDS } from '#/domain/director-settings.js';

export function DirectorPage() {
  const company = useCompanySettings();

  return (
    <CompanyScreen
      title="Director"
      icon={Workflow}
      intro="How the Director plans a card before any ticket exists: the model for each step, the house rules, the flow of steps and the limits. Changes apply to cards that start planning afterwards."
    >
      {(draft, config) => {
        const director = config.director;
        const saved = draft.history.find((v) => v.version === draft.version)?.doc as
          Record<string, unknown> | undefined;

        const usingDefaults =
          company.data?.serverHasDirector === false ||
          (saved?.['director'] === undefined &&
            (saved?.['models'] as Record<string, unknown> | undefined)?.['director'] ===
              undefined);

        const set = (path: string, value: unknown): void => draft.setField(path, value);

        if (draft.stagedResets.length > 0) {
          return (
            <DirectorStatus usingDefaults={false} resetStaged onReset={() => undefined} />
          );
        }

        return (
          <>
            <DirectorStatus
              usingDefaults={usingDefaults && !draft.dirty}
              resetStaged={false}
              onReset={() => draft.stageReset(['director', 'models.director'])}
            />
            <SettingsSection
              id="models"
              title="Model per step"
              description="Which model runs each Director step. Opus suits planning; Sonnet suits quick turns."
            >
              <ModelFields
                models={config.models.director}
                errors={draft.errors}
                onChange={(step, model) => set(`models.director.${step}`, model)}
              />
            </SettingsSection>
            <SettingsSection
              id="rules"
              title="House rules and approval"
              description="Standing instructions for every step, who approves a finished plan, and how far the Director may sign finished work."
            >
              <HouseRulesField
                value={director.house_rules}
                onChange={(v) => set('director.house_rules', v)}
              />
              <ApprovalField
                value={director.approval_mode}
                onChange={(v) => set('director.approval_mode', v)}
              />
              <SignOffField
                value={director.sign_off.max_tier}
                onChange={(v) => set('director.sign_off.max_tier', v)}
              />
            </SettingsSection>
            <SettingsSection
              id="limits"
              title="Questions, spend and reading"
              description="How much the Director asks, when it warns about cost, and how much of the repository a step may read."
            >
              <ConfigFields
                fields={[
                  ...DIRECTOR_FIELDS.grill,
                  ...DIRECTOR_FIELDS.budget_warning_usd,
                  ...DIRECTOR_FIELDS.read_caps,
                ]}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>
            <SettingsSection
              id="research"
              title="Research limits"
              description="How much the Director may look up on the web for one card. Pages are read as data and quotes are checked against the page; the search provider itself is set under Research in Forge settings."
            >
              <ConfigFields
                fields={DIRECTOR_FIELDS.research}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>
            <SettingsSection
              id="memory"
              title="Memory retrieval"
              description="How the Director reads this project's memory when it plans: how many decisions it pastes, and whether a quick model call first turns the question into search words."
            >
              <p className="mb-4 max-w-prose text-sm text-muted">
                {MEMORY_REJECTED_NOTE}
              </p>
              <ConfigFields
                fields={DIRECTOR_FIELDS.memory}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>
            <SettingsSection
              id="escalation"
              title="When a ticket waits"
              description="What the Director does with a Worker’s question or a stopped ticket before it asks you. Tier C tickets, tools and logins always come to you."
            >
              <ConfigFields
                fields={DIRECTOR_FIELDS.escalation}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>
            <SettingsSection
              id="pipelines"
              title="Ticket pipelines"
              description="Whether the Director may adjust a ticket’s own copy of its lane, and when it suggests a change to the project’s lane. It never changes your lane on its own."
            >
              <ConfigFields
                fields={DIRECTOR_FIELDS.pipelines}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>
            <SettingsSection
              id="timeouts"
              title="Step timeouts"
              description="How long each step may run before Forge gives up on it and retries or asks you."
            >
              <ConfigFields
                fields={DIRECTOR_FIELDS.step_timeouts_ms}
                config={config}
                errors={draft.errors}
                onChange={set}
              />
            </SettingsSection>
            <SettingsSection
              id="flow"
              title="Planning flow"
              description="The steps a card goes through before its plan is written. A card keeps the flow it started with, so editing this never changes a card already planning."
            >
              <FlowEditor
                flow={director.flow}
                playbooks={director.playbooks}
                onChange={(flow) => set('director.flow', flow)}
              />
            </SettingsSection>
            <SettingsSection
              id="playbooks"
              title="Playbooks"
              description="The written method each step follows. They ship with Forge and are read-only here."
            >
              <PlaybooksView playbooks={director.playbooks} />
            </SettingsSection>
            <SettingsSection
              id="locked"
              title="Locked rules"
              description="These protect the approval path. No setting can change them."
            >
              <LockedRules />
            </SettingsSection>
          </>
        );
      }}
    </CompanyScreen>
  );
}
