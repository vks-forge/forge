/**
 * Research copy: the sentences the owner reads about research, its settings and budgets.
 *
 * Why: research touches the outside world and money, so every outcome needs words an owner
 *   can act on. The Conversation says what a run did ("Researched: 3 searches, 5 pages, 7
 *   facts (2 unverified)") or, when it could not look anything up, says so and points at the
 *   setting to change. A failed provider test names the cause and the fix in plain terms
 *   instead of an error code. The plan says how many outside facts it rests on without a
 *   quote behind them. The budget cap box is read once, here, so a typo is a sentence under
 *   the box rather than a refusal from the server. A `research` payload is untrusted, so
 *   it is read with a forgiving schema and falls back to a neutral line.
 *
 * Exports: researchLineOf(), noteNeedsSettings(), providerTestWords(), outsideFactsBanner(),
 *   parseBudgetCap(), PROVIDER_ITEMS, RESEARCH_ERROR_FIX.
 * Depends on: @forge/core (types), schemas/card-events, types/picker.types,
 *   types/research-ui.types. No IO.
 */

import type { ResearchErrorKind, ResearchTestReply } from '@forge/core';
import { ResearchRan } from '#/schemas/card-events.js';
import type { PickerItem } from '#/types/picker.types.js';
import type {
  BudgetCapParse,
  ProviderTestWords,
  ResearchLineView,
} from '#/types/research-ui.types.js';

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** Notes that the owner fixes in settings: research switched off, or the provider not answering. */
export function noteNeedsSettings(note: string | null | undefined): boolean {
  return /research is off|did not answer|not configured|turn it on/i.test(note ?? '');
}

/** One `research` event as a Conversation line; a payload that cannot be read still gets a line. */
export function researchLineOf(payload: unknown): ResearchLineView {
  const parsed = ResearchRan.safeParse(payload);

  if (!parsed.success) {
    return { text: 'Research ran.', note: null, unanswered: [], settingsHelp: false };
  }

  const { searches, fetched, claims, unanswered, note } = parsed.data;
  const unverified = claims.filter((c) => c.status === 'unverified').length;
  const looked = searches.length + fetched.length;
  const trimmed = note?.trim() ?? '';

  const text =
    looked === 0 && claims.length === 0 && trimmed !== ''
      ? 'Research could not run'
      : `Researched: ${plural(searches.length, 'search', 'searches')}, ${plural(
          fetched.length,
          'page',
        )}, ${plural(claims.length, 'fact')}${unverified > 0 ? ` (${unverified} unverified)` : ''}`;

  return {
    text,
    note: trimmed === '' ? null : trimmed,
    unanswered,
    settingsHelp: noteNeedsSettings(trimmed),
  };
}

export const PROVIDER_ITEMS: readonly PickerItem[] = [
  {
    value: 'searxng',
    label: 'SearXNG',
    description: 'A search engine you run yourself; no account or key.',
  },
  {
    value: 'none',
    label: 'Off',
    description: 'No web search. The Director says so and plans without outside facts.',
  },
];

/** What to do about each kind of provider failure, in the owner's terms. */
export const RESEARCH_ERROR_FIX: Readonly<Record<ResearchErrorKind, string>> = {
  not_configured:
    'Choose SearXNG as the provider and enter its address to turn research on.',
  denied:
    'The address is not allowed. Add its host to "Other hosts allowed for SearXNG", or use an address on this machine.',
  unreachable:
    'Nothing answered at that address. Start SearXNG (it is not running) and check the address and port.',
  timeout:
    'It answered too slowly. Check that SearXNG is running, or raise the page timeout.',
  too_large: 'The answer was larger than Forge accepts. Check the address.',
  bad_content:
    'The address answered, but not like SearXNG. Check that the JSON format is enabled in its settings.',
  http_error:
    'The server answered with an error. Check its logs, and that the address is the SearXNG one.',
};

/** A test result as a headline and, on failure, the server's message and the fix. */
export function providerTestWords(reply: ResearchTestReply): ProviderTestWords {
  if (reply.ok) {
    return {
      ok: true,
      headline:
        reply.latency_ms === undefined
          ? 'The search provider answered.'
          : `The search provider answered in ${reply.latency_ms} ms.`,
      fix: null,
    };
  }

  const kind = reply.error?.kind ?? 'not_configured';
  const message = reply.error?.message ?? 'The provider did not answer.';

  return {
    ok: false,
    headline: message,
    fix: RESEARCH_ERROR_FIX[kind],
  };
}

/** "Needs your approval: rests on 1 unverified outside fact"; null when nothing is unverified. */
export function outsideFactsBanner(unverified: number): string | null {
  return unverified > 0
    ? `Needs your approval: rests on ${plural(unverified, 'unverified outside fact')}`
    : null;
}

/** The cap box as a value: empty clears it, a number from 0 up sets it, anything else is a sentence. */
export function parseBudgetCap(text: string): BudgetCapParse {
  const trimmed = text.trim().replace(/^\$/, '');

  if (trimmed === '') {
    return { ok: true, value: null };
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value)) {
    return { ok: false, message: 'Enter a number of dollars, or leave it empty.' };
  }

  if (value < 0) {
    return { ok: false, message: 'A cap cannot be below 0.' };
  }

  return { ok: true, value: Math.round(value * 100) / 100 };
}
