/**
 * Pins: how a project's research override is read and written: only what narrows is stored,
 * entries that are not host names are refused in words, the editor state round-trips, and the
 * effect on the project is said in plain sentences, including the allow list that shares
 * nothing with the company's (which switches research off).
 *
 * Why: a project may be stricter than the company about the open web but never looser. A saved
 *   `enabled: true` or an empty list would freeze a value that should follow the company; a
 *   pasted URL as a host would never match and give a false sense of safety; an allow list with
 *   no overlap silently turns research off, and the owner should be told.
 * Depends on: domain/research-narrowing, domain/settings-draft. No DOM.
 */

import type { ResearchSettings } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  narrowingWords,
  NO_RESEARCH_NARROWING,
  researchDocOf,
  researchDraftOf,
  researchIssues,
} from '#/domain/research-narrowing.js';
import { docFromDraft, FIELD_KEYS, SCOPE_FIELDS } from '#/domain/settings-draft.js';
import type { ResearchDraft, SettingsDraft } from '#/types/project-settings.types.js';

const company = (over: Partial<ResearchSettings['fetch']> = {}): ResearchSettings => ({
  provider: 'searxng',
  searxng: { base_url: 'http://localhost:8888', allow_hosts: [] },
  fetch: { allow_hosts: [], deny_hosts: [], timeout_ms: 10_000, ...over },
});

describe('the stored document', () => {
  it('stores nothing that equals "no change"', () => {
    expect(researchDocOf(NO_RESEARCH_NARROWING)).toEqual({});
  });

  it('stores only the switch, the deny hosts and the allow hosts that were given', () => {
    expect(
      researchDocOf({
        enabled: false,
        deny_hosts: ' ads.example.net \n\nx.example ',
        allow_hosts: 'docs.example.com',
      }),
    ).toEqual({
      enabled: false,
      deny_hosts: ['ads.example.net', 'x.example'],
      allow_hosts: ['docs.example.com'],
    });
  });

  it('reads a stored override back into the editor, and no override as inherited', () => {
    expect(researchDraftOf(undefined)).toEqual({
      overridden: false,
      value: NO_RESEARCH_NARROWING,
    });

    expect(
      researchDraftOf({ enabled: false, deny_hosts: ['a.example', 'b.example'] }),
    ).toEqual({
      overridden: true,
      value: { enabled: false, deny_hosts: 'a.example\nb.example', allow_hosts: '' },
    });

    expect(researchDraftOf({})).toEqual({
      overridden: true,
      value: NO_RESEARCH_NARROWING,
    });

    expect(researchDraftOf([1, 2]).overridden).toBe(false);
  });

  it('is written by the project document only while overridden, and removed otherwise', () => {
    const draft = {
      research: {
        overridden: true,
        value: { enabled: true, deny_hosts: 'a.example', allow_hosts: '' },
      },
    } as unknown as SettingsDraft;

    expect(FIELD_KEYS).toContain('research');
    expect(SCOPE_FIELDS.research).toEqual(['research']);

    const blank = {
      ...Object.fromEntries(
        FIELD_KEYS.filter((k) => k !== 'research').map((k) => [
          k,
          { overridden: false, value: '' },
        ]),
      ),
      revoked: [],
    };

    expect(docFromDraft({}, { ...blank, ...draft } as unknown as SettingsDraft)).toEqual({
      research: { deny_hosts: ['a.example'] },
    });

    expect(
      docFromDraft({ research: { enabled: false }, keep: 1 }, {
        ...blank,
        research: { overridden: false, value: NO_RESEARCH_NARROWING },
      } as unknown as SettingsDraft),
    ).toEqual({ keep: 1 });
  });
});

describe('refusing what is not a host', () => {
  const field = (value: ResearchDraft, overridden = true) => ({ overridden, value });

  it('accepts plain host names', () => {
    expect(
      researchIssues(
        field({
          enabled: true,
          deny_hosts: 'a.example\nb.example.org',
          allow_hosts: 'c.io',
        }),
      ),
    ).toEqual([]);
  });

  it('names a pasted URL, a path or a space in words, on the research field', () => {
    const issues = researchIssues(
      field({
        enabled: true,
        deny_hosts: 'https://a.example/x',
        allow_hosts: 'b.example/path\nok.example\nhas space',
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('research');
    expect(issues[0]?.message).toMatch(/Write hosts only, such as docs\.example\.com/);
    expect(issues[0]?.message).toContain('https://a.example/x');
    expect(issues[0]?.message).not.toContain('ok.example');
  });

  it('says nothing about an override the project has not switched on', () => {
    expect(
      researchIssues(
        field(
          { enabled: true, deny_hosts: 'https://a.example/x', allow_hosts: '' },
          false,
        ),
      ),
    ).toEqual([]);
  });
});

describe('what the project ends up with', () => {
  it('says nothing when nothing narrows', () => {
    expect(narrowingWords(company(), NO_RESEARCH_NARROWING)).toEqual([]);
  });

  it('says research is off for the project, and that a company that is off cannot be turned on', () => {
    expect(
      narrowingWords(company(), { ...NO_RESEARCH_NARROWING, enabled: false }),
    ).toEqual([
      'Research is off for this project: the Director plans without outside facts.',
    ]);

    expect(
      narrowingWords({ ...company(), provider: 'none' }, NO_RESEARCH_NARROWING),
    ).toEqual([
      'Research is off for the whole company, so this project cannot turn it on.',
    ]);
  });

  it('lists the extra denied hosts and the allowed ones, narrowed by the company list', () => {
    expect(
      narrowingWords(company(), {
        enabled: true,
        deny_hosts: 'ads.example.net',
        allow_hosts: 'a.example\nb.example',
      }),
    ).toEqual([
      'Never reads ads.example.net, besides what the company already denies.',
      'Reads only a.example, b.example.',
    ]);

    expect(
      narrowingWords(company({ allow_hosts: ['a.example', 'z.example'] }), {
        enabled: true,
        deny_hosts: '',
        allow_hosts: 'a.example\nb.example',
      }),
    ).toEqual(['Reads only a.example.']);
  });

  it('warns that an allow list sharing nothing with the company switches research off', () => {
    expect(
      narrowingWords(company({ allow_hosts: ['z.example'] }), {
        enabled: true,
        deny_hosts: '',
        allow_hosts: 'a.example',
      }),
    ).toEqual([
      'None of these hosts is allowed by the company, so research is off for this project.',
    ]);
  });
});
