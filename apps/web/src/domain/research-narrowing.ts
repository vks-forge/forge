/**
 * Project research narrowing: how a project departs from the company's research settings.
 *
 * Why: a project may be stricter about the open web than the company (no research at all on a
 *   regulated codebase, never read a competitor's site) but never looser, because the company
 *   setting is the boundary the owner drew once for everything (d-0144). The project stores
 *   only what narrows: `enabled: false`, extra denied hosts, and an allowed-host list that
 *   shrinks the company's. The editor works with host lists as text, one per line, and this
 *   file turns that into the stored document and back, refuses entries that are not host
 *   names (a pasted URL would never match anything), and says in words what the project ends
 *   up with, including the case the server resolves by switching research off: an allow list
 *   that shares nothing with the company's. Pure, so tests pin each rule.
 *
 * Exports: NO_RESEARCH_NARROWING, researchDraftOf(), researchDocOf(), researchIssues(),
 *   narrowingWords().
 * Depends on: @forge/core (types), types/project-settings.types. No IO.
 */

import type { ResearchSettings } from '@forge/core';
import type {
  FieldDraft,
  ResearchDraft,
  SettingsIssue,
} from '#/types/project-settings.types.js';

export const NO_RESEARCH_NARROWING: ResearchDraft = {
  enabled: true,
  deny_hosts: '',
  allow_hosts: '',
};

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/** The editor state for a stored `research` override: overridden exactly when the document has the key. */
export function researchDraftOf(override: unknown): FieldDraft<ResearchDraft> {
  if (typeof override !== 'object' || override === null || Array.isArray(override)) {
    return { overridden: false, value: NO_RESEARCH_NARROWING };
  }

  const doc = override as Record<string, unknown>;

  return {
    overridden: true,
    value: {
      enabled: doc['enabled'] !== false,
      deny_hosts: strings(doc['deny_hosts']).join('\n'),
      allow_hosts: strings(doc['allow_hosts']).join('\n'),
    },
  };
}

/** The document a save writes: only what narrows, nothing that equals "no change". */
export function researchDocOf(value: ResearchDraft): Record<string, unknown> {
  const deny = lines(value.deny_hosts);
  const allow = lines(value.allow_hosts);

  return {
    ...(value.enabled ? {} : { enabled: false }),
    ...(deny.length > 0 ? { deny_hosts: deny } : {}),
    ...(allow.length > 0 ? { allow_hosts: allow } : {}),
  };
}

const NOT_A_HOST = /[\s/\\]|:\/\//;

/** Everything in an overridden research field the server would refuse or that could never match, in words. */
export function researchIssues(field: FieldDraft<ResearchDraft>): SettingsIssue[] {
  const { value } = field;
  const bad = [...lines(value.deny_hosts), ...lines(value.allow_hosts)].filter(
    (host) => NOT_A_HOST.test(host) || host.length > 253,
  );

  return !field.overridden || bad.length === 0
    ? []
    : [
        {
          field: 'research',
          message: `Write hosts only, such as docs.example.com, without http:// or a path: ${bad.slice(0, 3).join(', ')}.`,
        },
      ];
}

/** What the project ends up with, one sentence per effect; empty when it changes nothing. */
export function narrowingWords(
  company: ResearchSettings,
  value: ResearchDraft,
): string[] {
  if (company.provider === 'none') {
    return ['Research is off for the whole company, so this project cannot turn it on.'];
  }

  if (!value.enabled) {
    return [
      'Research is off for this project: the Director plans without outside facts.',
    ];
  }

  const out: string[] = [];
  const deny = lines(value.deny_hosts);
  const allow = lines(value.allow_hosts);
  const companyAllow = company.fetch.allow_hosts;

  if (deny.length > 0) {
    out.push(`Never reads ${deny.join(', ')}, besides what the company already denies.`);
  }

  if (allow.length > 0) {
    const kept =
      companyAllow.length === 0
        ? allow
        : allow.filter((host) => companyAllow.includes(host));

    out.push(
      kept.length === 0
        ? 'None of these hosts is allowed by the company, so research is off for this project.'
        : `Reads only ${kept.join(', ')}.`,
    );
  }

  return out;
}
