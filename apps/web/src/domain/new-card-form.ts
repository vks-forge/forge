/**
 * New card form: validation, the request it becomes, and the picker lists behind it.
 *
 * Why: the popup must say what is wrong with a field while the user is still typing and keep
 *   Create disabled until the server would accept the card, so the rules (title and description
 *   length, links that are real web addresses, a card never both waiting for and blocking the
 *   same card) live here as plain functions the popup only calls. The dependency pickers offer
 *   open cards only: a closed or finished card can no longer hold work up. When the server
 *   still refuses (a loop that only it can see, a card closed meanwhile), `refusalOf` turns the
 *   answer into a sentence, and a loop names the cards in it so the user knows which link to
 *   remove.
 *
 * Exports: EMPTY_NEW_CARD, descriptionHint(), validateNewCard(), toNewCardInput(), openCardItems(), refusalOf(),
 *   cycleOf(), TYPE_ITEMS, PRIORITY_ITEMS.
 * Depends on: schemas/new-card, schemas/cards (types), api/api-error, api/describe-error,
 *   types/new-card.types, types/picker.types. No IO.
 */

import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import type { CardPriority, CardSummary } from '#/schemas/cards.js';
import { DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN, isWebUrl } from '#/schemas/new-card.js';
import type { NewCardInput, NewCardType } from '#/schemas/new-card.js';
import type { PickerItem } from '#/types/picker.types.js';
import type {
  CardRefusal,
  NewCardForm,
  NewCardProblems,
} from '#/types/new-card.types.js';

export const EMPTY_NEW_CARD: NewCardForm = {
  title: '',
  description: '',
  type: 'plan',
  priority: 'normal',
  dependsOn: [],
  blocks: [],
  links: [],
};

export const TYPE_ITEMS: readonly (PickerItem & { value: NewCardType })[] = [
  {
    value: 'plan',
    label: 'Plan',
    description: 'The Director asks, checks and writes a plan for you to approve',
  },
  {
    value: 'discussion',
    label: 'Discussion',
    description: 'Talk it through; nothing is built',
  },
  {
    value: 'issue',
    label: 'Issue',
    description: 'A fix or a small change that needs a short plan',
  },
];

export const PRIORITY_ITEMS: readonly (PickerItem & { value: CardPriority })[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/**
 * The description's hint: what is wanted and why it is wanted, with a live count until the minimum
 * is met, so a disabled Create always has its reason on screen before anything is typed.
 */
export function descriptionHint(description: string): string {
  const length = description.trim().length;
  const base = `At least ${DESCRIPTION_MIN} characters, so the Director has something to start from. Markdown works.`;

  return length >= DESCRIPTION_MIN
    ? base
    : `${base} ${length} of ${DESCRIPTION_MIN} so far.`;
}

/** What is wrong with the form, field by field; an empty object means Create may be enabled. */
export function validateNewCard(form: NewCardForm): NewCardProblems {
  const problems: { -readonly [K in keyof NewCardProblems]: string } = {};
  const title = form.title.trim();
  const description = form.description.trim();

  if (title.length < TITLE_MIN) {
    problems.title = `Give it a title of at least ${TITLE_MIN} characters.`;
  } else if (title.length > TITLE_MAX) {
    problems.title = `Keep the title to ${TITLE_MAX} characters or fewer (now ${title.length}).`;
  }

  if (description.length < DESCRIPTION_MIN) {
    problems.description = `Say a little more: at least ${DESCRIPTION_MIN} characters (now ${description.length}).`;
  }

  const both = form.dependsOn.filter((id) => form.blocks.includes(id));
  if (both.length > 0) {
    problems.blocks = `${both.join(', ')} cannot both wait for this card and be waited on by it. Remove it from one list.`;
  }

  if (form.links.some((link) => !isWebUrl(link))) {
    problems.links = 'Every link must start with http:// or https://.';
  }

  return problems;
}

/** The request body for a valid form; `dedupeKey` stays the same for every retry of one popup. */
export function toNewCardInput(form: NewCardForm, dedupeKey: string): NewCardInput {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    priority: form.priority,
    depends_on: [...form.dependsOn],
    blocks: [...form.blocks],
    links: [...form.links],
    dedupe_key: dedupeKey,
  };
}

/** Cards a new card could wait for or hold up: not closed, not done. */
export function openCardItems(cards: readonly CardSummary[]): readonly PickerItem[] {
  return cards
    .filter(
      (card) =>
        card.column !== 'closed' &&
        card.column !== 'done' &&
        card.closed_reason === undefined,
    )
    .map((card) => ({ value: card.id, label: `${card.id} · ${card.title}` }));
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;

/** The cards in a `dependency_cycle` refusal, wherever the server put the list. */
export function cycleOf(error: ApiError): readonly string[] | null {
  const body = asRecord(error.body);
  const inner = asRecord(body?.['error']);
  const candidates = [
    inner?.['cycle'],
    asRecord(inner?.['details'])?.['cycle'],
    body?.['cycle'],
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((id) => typeof id === 'string')) {
      return candidate as string[];
    }
  }

  return null;
}

/** A refused create in words. */
export function refusalOf(error: unknown): CardRefusal {
  if (error instanceof ApiError && error.kind === 'http') {
    switch (error.code) {
      case 'dependency_cycle': {
        const cycle = cycleOf(error);

        return {
          field: 'dependsOn',
          message:
            cycle === null
              ? 'These dependencies would make a loop of cards waiting on each other. Remove one.'
              : `These dependencies would make a loop: ${cycle.join(' → ')}. Remove one of them.`,
        };
      }

      case 'card_not_found':
        return {
          field: 'dependsOn',
          message:
            'A card you picked no longer exists. Remove it from the lists and try again.',
        };
      case 'cross_project_dependency':
        return {
          field: 'dependsOn',
          message: 'Dependencies must be cards of this project. Remove the others.',
        };
      case 'project_not_found':
        return { message: 'This project no longer exists, so the card was not created.' };
      case 'invalid_request':
        return {
          message: `Forge did not accept the card: ${error.message}. Your text is kept; fix it and press Create.`,
        };
      default:
        break;
    }
  }

  const { title, detail } = describeError(error);

  return { message: `${title}. ${detail} Your text is kept; press Create to try again.` };
}
