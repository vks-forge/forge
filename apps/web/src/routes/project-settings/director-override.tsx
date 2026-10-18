/**
 * DirectorOverride: how this project's Director differs from the company's.
 *
 * Why: one project may want a stricter Director (always ask before a plan starts, a house rule
 *   about its billing code, an extra review step) without changing every other project. Each
 *   Director setting is inherited until the owner overrides it, shows the company value it
 *   would follow, and "Reset to company" drops every override at once. Models are not here on
 *   purpose: they are chosen once for all projects on the Forge Director page. A flow edited
 *   here is checked against the same locked-step rules as the company's, in words, before
 *   saving.
 *
 * Exports: DirectorOverride.
 * Depends on: react-router, components/director/*, components/settings/config-fields,
 *   components/ui/button, domain/director-*, routes/project-settings/override-field.
 */

import type { DirectorConfig } from '@forge/core';
import { Link } from 'react-router';
import { FlowEditor } from '#/components/director/flow-editor.js';
import {
  ApprovalField,
  HouseRulesField,
  SignOffField,
} from '#/components/director/rules-fields.js';
import { ConfigFields } from '#/components/settings/config-fields.js';
import { Button } from '#/components/ui/button.js';
import {
  toggleDirectorKey,
  setDirectorPath,
  withDirectorValue,
} from '#/domain/director-override.js';
import {
  APPROVAL_ITEMS,
  DIRECTOR_FIELDS,
  SIGN_OFF_ITEMS,
  describeFlow,
  effectiveDirector,
  overriddenKeys,
} from '#/domain/director-settings.js';
import { OverrideField } from '#/routes/project-settings/override-field.js';
import type { SettingsDraft, SettingsSnapshot } from '#/types/project-settings.types.js';
import type { DirectorRow, OverridableKey } from '#/types/director-ui.types.js';

const ROWS: readonly DirectorRow[] = [
  {
    key: 'house_rules',
    label: 'Director house rules',
    hint: 'Standing instructions added to every Director step on this project.',
    words: (d) => (d.house_rules.trim() === '' ? 'No house rules' : d.house_rules),
  },
  {
    key: 'approval_mode',
    label: 'Director plan approval',
    hint: 'Whether the Director may approve a plan that passes the fixed checks.',
    words: (d) => APPROVAL_ITEMS.find((i) => i.value === d.approval_mode)?.label ?? '',
  },
  {
    key: 'sign_off',
    label: 'Director sign-off',
    hint: 'How far the Director may sign finished work here. A project can only lower the company setting; tier C always needs you.',
    words: (d) =>
      SIGN_OFF_ITEMS.find((i) => i.value === d.sign_off.max_tier)?.label ?? '',
  },
  {
    key: 'grill',
    label: 'Director question limits',
    hint: 'How many questions a round asks, and how many rounds.',
    words: (d) =>
      `${d.grill.max_questions_per_round} questions per round, ${d.grill.max_rounds} rounds`,
  },
  {
    key: 'budget_warning_usd',
    label: 'Director budget warning',
    hint: 'A warning only, never a stop.',
    words: (d) => `Warn at $${d.budget_warning_usd}`,
  },
  {
    key: 'read_caps',
    label: 'Director read caps',
    hint: 'How much of the repository one step may read.',
    words: (d) => `${d.read_caps.max_files} files, ${d.read_caps.max_bytes / 1000} KB`,
  },
  {
    key: 'escalation',
    label: 'Director on waiting tickets',
    hint: 'Whether the Director looks first, how sure it must be to answer a Worker, and how often it retries.',
    words: (d) =>
      d.escalation.director_first
        ? `Looks first, answers at ${Math.round(d.escalation.answer_confidence * 100)}% confidence, ${d.escalation.max_director_retries} retries`
        : 'Everything goes to you',
  },
  {
    key: 'step_timeouts_ms',
    label: 'Director step timeouts',
    hint: 'How long each step may run.',
    words: (d) => `${Object.keys(d.step_timeouts_ms).length} timeouts`,
  },
  {
    key: 'flow',
    label: 'Director planning flow',
    hint: 'The steps a card goes through before its plan is written.',
    words: (d) => describeFlow(d.flow),
  },
];

export function DirectorOverride(props: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  issues: readonly string[];
  onChange: (next: SettingsDraft) => void;
  disabled: boolean;
}) {
  const { snapshot, draft } = props;
  const company = snapshot.company.director;
  const value = draft.director.value;
  const seen = effectiveDirector(company, value);
  const count = overriddenKeys(value).length;
  const write = (next: Partial<DirectorConfig>): void =>
    props.onChange({ ...draft, director: withDirectorValue(next) });

  const editor = (key: OverridableKey) => {
    switch (key) {
      case 'house_rules':
        return (
          <HouseRulesField
            value={seen.house_rules}
            onChange={(v) => write({ ...value, house_rules: v })}
          />
        );
      case 'approval_mode':
        return (
          <ApprovalField
            value={seen.approval_mode}
            onChange={(v) => write({ ...value, approval_mode: v })}
          />
        );
      case 'sign_off':
        return (
          <SignOffField
            value={seen.sign_off.max_tier}
            ceiling={company.sign_off.max_tier}
            onChange={(max_tier) => write({ ...value, sign_off: { max_tier } })}
          />
        );
      case 'flow':
        return (
          <FlowEditor
            flow={seen.flow}
            playbooks={seen.playbooks}
            onChange={(flow) => write({ ...value, flow })}
          />
        );
      default:
        return (
          <ConfigFields
            fields={DIRECTOR_FIELDS[key]}
            config={{ director: seen }}
            errors={{}}
            onChange={(path, leaf) => write(setDirectorPath(seen, value, path, leaf))}
          />
        );
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <p role="status" className="text-sm">
          {count === 0
            ? 'Using company default.'
            : `Overriding ${count} Director setting${count === 1 ? '' : 's'}.`}
        </p>
        <Button disabled={count === 0 || props.disabled} onClick={() => write({})}>
          Reset to company
        </Button>
      </div>
      <p className="text-xs text-muted">
        Models are set for every project on the{' '}
        <Link to="/settings/director" className="underline">
          Director page in Forge settings
        </Link>
        .
      </p>
      <div className="rounded-xl border border-line bg-surface px-4 sm:px-5">
        {ROWS.map((row) => (
          <OverrideField
            key={row.key}
            id={`field-director-${row.key}`}
            label={row.label}
            hint={row.hint}
            overridden={row.key in value}
            onToggle={(on) => write(toggleDirectorKey(value, row.key, on, company))}
            source="Company default"
            inherited={row.words(company)}
            inheritedView={row.words(company)}
            disabled={props.disabled}
          >
            {editor(row.key)}
          </OverrideField>
        ))}
      </div>
      {props.issues.length > 0 ? (
        <ul className="grid gap-1">
          {props.issues.map((message) => (
            <li key={message} role="alert" className="text-xs text-danger">
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
