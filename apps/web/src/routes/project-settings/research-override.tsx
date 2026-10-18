/**
 * ResearchOverride: how this project's research is stricter than the company's.
 *
 * Why: one project may want no web research at all, or may never want certain sites read,
 *   without changing every other project. The company's Research settings are the boundary, so
 *   a project can only narrow them: switch research off, deny more hosts, or shrink the allowed
 *   list. The editor says so beside the controls, shows what the project ends up with in words
 *   (including the trap of an allow list that shares nothing with the company's, which turns
 *   research off), and when the company has research off it says that nothing here can turn
 *   it on. Inherited, the project simply follows the company and later changes to it.
 *
 * Exports: ResearchOverride.
 * Depends on: react-router, components/research/hosts-field, components/ui/field,
 *   domain/nav-entries, domain/research-narrowing, routes/project-settings/override-field,
 *   types/project-settings.types.
 */

import { Link } from 'react-router';
import { HostsField } from '#/components/research/hosts-field.js';
import { Switch } from '#/components/ui/field.js';
import { settingsPath } from '#/domain/nav-entries.js';
import { narrowingWords, NO_RESEARCH_NARROWING } from '#/domain/research-narrowing.js';
import { OverrideField } from '#/routes/project-settings/override-field.js';
import type { SettingsDraft, SettingsSnapshot } from '#/types/project-settings.types.js';

const toLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

export function ResearchOverride(props: {
  snapshot: SettingsSnapshot;
  draft: SettingsDraft;
  issues: readonly string[];
  onChange: (next: SettingsDraft) => void;
  disabled: boolean;
}) {
  const { snapshot, draft } = props;
  const company = snapshot.company.research;
  const state = draft.research;
  const write = (value: SettingsDraft['research']['value']): void =>
    props.onChange({ ...draft, research: { overridden: true, value } });

  const companyWords =
    company.provider === 'none'
      ? 'Research is off for the company'
      : `Research is on (${company.provider}); ${
          company.fetch.allow_hosts.length > 0
            ? `reads only ${company.fetch.allow_hosts.join(', ')}`
            : 'any public host that is not denied'
        }`;

  const effect = narrowingWords(company, state.value);

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">
        The search provider and the company's host lists are set in{' '}
        <Link to={settingsPath('research')} className="underline">
          Research in Forge settings
        </Link>
        . A project can only narrow them.
      </p>
      <div className="rounded-xl border border-line bg-surface px-4 sm:px-5">
        <OverrideField
          id="field-research"
          label="Research on this project"
          hint="Switch research off here, deny more hosts, or allow fewer. It narrows the company setting and never widens it."
          overridden={state.overridden}
          onToggle={(on) =>
            props.onChange({
              ...draft,
              research: {
                overridden: on,
                value: on ? state.value : NO_RESEARCH_NARROWING,
              },
            })
          }
          source="Company setting"
          inherited={companyWords}
          inheritedView={companyWords}
          disabled={props.disabled}
        >
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={state.value.enabled}
                disabled={props.disabled}
                label="Allow research on this project"
                onChange={(enabled) => write({ ...state.value, enabled })}
              />
              <div className="grid gap-0.5">
                <p className="text-sm font-medium">Allow research on this project</p>
                <p className="text-xs text-muted">
                  When off, the Director plans here without outside facts and says so on
                  the card.
                </p>
              </div>
            </div>
            <HostsField
              id="project-research-deny"
              label="Also never read these hosts"
              hint="One host per line. Added to the company's denied hosts."
              value={toLines(state.value.deny_hosts)}
              disabled={props.disabled}
              placeholder="example.net"
              onChange={(hosts) =>
                write({ ...state.value, deny_hosts: hosts.join('\n') })
              }
            />
            <HostsField
              id="project-research-allow"
              label="Only read these hosts"
              hint="One host per line. Narrows the company's allowed hosts; leave empty to follow them."
              value={toLines(state.value.allow_hosts)}
              disabled={props.disabled}
              placeholder="docs.example.com"
              onChange={(hosts) =>
                write({ ...state.value, allow_hosts: hosts.join('\n') })
              }
            />
            {effect.length > 0 ? (
              <ul aria-label="What this project ends up with" className="grid gap-1">
                {effect.map((line) => (
                  <li key={line} role="status" className="text-xs">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </OverrideField>
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
