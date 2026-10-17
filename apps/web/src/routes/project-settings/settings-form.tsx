/**
 * SettingsForm: every overridable project setting, each with its inherited value beside it.
 *
 * Why: this is the part of the screen that changes how Workers behave on this project, so
 *   each field says where its value comes from and lets the owner depart from it
 *   deliberately. Checks are by role (d-0095). Concurrency can only be lowered below the
 *   company limit (d-0097) and the form says so before the server has to. The Tier C path
 *   list warns that it replaces the safe set, because dropping `.forge/**` quietly lets
 *   Workers change Forge's own policy without a human sign-off. The fields are split over the
 *   Workers, Checks and Repository tabs; one draft serves all three.
 *
 * Exports: SettingsForm.
 * Depends on: react, domain/settings-draft, routes/project-settings/*, components/ui/field.
 */

import { INPUT_CLASS } from '#/components/ui/field.js';
import {
  inheritedOf,
  parseLines,
  SAFE_TIER_C,
  SCOPE_FIELDS,
  setOverridden,
} from '#/domain/settings-draft.js';
import { ChecksEditor } from '#/routes/project-settings/checks-editor.js';
import { OverrideField } from '#/routes/project-settings/override-field.js';
import type {
  FieldKey,
  FormScope,
  SettingsDraft,
  SettingsIssue,
  SettingsSnapshot,
  TextFieldSpec,
} from '#/types/project-settings.types.js';

const TEXT_FIELDS: readonly TextFieldSpec[] = [
  {
    key: 'default_harness',
    label: 'Default harness',
    hint: 'The tool Workers run in for this project.',
    source: 'Forge default',
    multiline: false,
    placeholder: 'claude-code',
  },
  {
    key: 'max_concurrent',
    label: 'Workers at once',
    hint: 'Lowers this project below the company limit; it can never raise it.',
    source: 'Company limit',
    multiline: false,
    placeholder: '1',
  },
  {
    key: 'harness_fallbacks',
    label: 'Fallback harnesses',
    hint: 'Tried in order when the default is out of quota. One per line; empty means wait.',
    source: 'Company list',
    multiline: true,
    placeholder: 'codex',
  },
  {
    key: 'ecosystems',
    label: 'Ecosystems',
    hint: 'node, python, go. One per line; empty means the gates detect them from the diff.',
    source: 'Forge default',
    multiline: true,
    placeholder: 'node',
  },
  {
    key: 'tier_c_globs',
    label: 'Tier C paths',
    hint: 'Changes to these paths always need your sign-off. One pattern per line.',
    source: 'Forge safe set',
    multiline: true,
    placeholder: '.forge/**',
  },
  {
    key: 'remote',
    label: 'Remote name',
    hint: 'The git remote branches are pushed to. Empty uses the git host setting.',
    source: 'Forge default',
    multiline: false,
    placeholder: 'origin',
  },
];

const plain = (text: string, empty: string): string =>
  text.trim() === '' ? empty : text.split('\n').join(', ');

export function SettingsForm(props: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  issues: readonly SettingsIssue[];
  onChange: (next: SettingsDraft) => void;
  disabled: boolean;
  /** The tab this form serves; only its fields are shown. */
  scope: FormScope;
}) {
  const { snapshot, draft } = props;
  const shown: readonly FieldKey[] = SCOPE_FIELDS[props.scope];
  const errorOf = (key: FieldKey): string | undefined =>
    props.issues.find((i) => i.field === key)?.message;

  const toggle = (key: FieldKey, on: boolean): void =>
    props.onChange(setOverridden(draft, snapshot, key, on));

  const inheritedChecks = inheritedOf(
    snapshot,
    'checks',
  ) as SettingsDraft['checks']['value'];

  return (
    <div className="rounded-xl border border-line bg-surface px-4 sm:px-5">
      {shown.includes('checks') ? (
        <OverrideField
          id="field-checks"
          label="Checks by role"
          hint="The commands the gates run in this project's worktree, in order."
          overridden={draft.checks.overridden}
          onToggle={(on) => toggle('checks', on)}
          source="Forge default"
          inherited={
            inheritedChecks.length === 0
              ? 'no checks'
              : `${inheritedChecks.length} checks`
          }
          inheritedView={
            draft.checks.value.length === 0
              ? 'No checks'
              : draft.checks.value.map((c) => `${c.role}: ${c.command}`).join(', ')
          }
          error={errorOf('checks')}
          disabled={props.disabled}
        >
          <ChecksEditor
            checks={draft.checks.value}
            onChange={(checks) =>
              props.onChange({ ...draft, checks: { overridden: true, value: checks } })
            }
          />
        </OverrideField>
      ) : null}

      {TEXT_FIELDS.filter((spec) => shown.includes(spec.key)).map((spec) => {
        const state = draft[spec.key];
        const id = `field-${spec.key}`;
        const inherited = inheritedOf(snapshot, spec.key) as string;
        const error = errorOf(spec.key);
        const common = {
          id,
          'aria-labelledby': `${id}-title`,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${id}-error` : undefined,
          placeholder: spec.placeholder,
          value: state.value,
          className: `${INPUT_CLASS} font-data`,
        } as const;

        const set = (value: string): void =>
          props.onChange({ ...draft, [spec.key]: { overridden: true, value } });

        return (
          <OverrideField
            key={spec.key}
            id={id}
            label={spec.label}
            hint={spec.hint}
            overridden={state.overridden}
            onToggle={(on) => toggle(spec.key, on)}
            source={spec.source}
            inherited={plain(inherited, 'none')}
            inheritedView={plain(state.value, 'None')}
            error={error}
            disabled={props.disabled}
          >
            {spec.multiline ? (
              <textarea
                {...common}
                rows={Math.max(2, parseLines(state.value).length + 1)}
                onChange={(event) => set(event.target.value)}
              />
            ) : (
              <input {...common} onChange={(event) => set(event.target.value)} />
            )}
            {spec.key === 'tier_c_globs' &&
            !SAFE_TIER_C.every((g) => parseLines(state.value).includes(g)) ? (
              <p role="status" className="text-xs text-attn">
                This list replaces the safe set. Keep {SAFE_TIER_C.join(', ')} unless you
                mean to let Workers change them without your sign-off.
              </p>
            ) : null}
          </OverrideField>
        );
      })}
    </div>
  );
}
