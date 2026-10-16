/**
 * NewCardFields: the fields of the New card popup.
 *
 * Why: the first message a card carries decides how good the Director's first questions are,
 *   so the form asks for what it needs and hints at the rest ("What do you want, and why? The
 *   Director will ask the rest."). Type and Priority are Pickers; Depends on and Blocks are
 *   searchable multi-Pickers over the project's open cards, read from the same cards query the
 *   Board uses so they share its cache and its live updates. A field shows its problem only
 *   once it has been left (a title that is two letters long mid-typing is not an error yet);
 *   problems the form can know without being left (a card on both lists, a refusal from the
 *   server) show at once.
 *
 * Exports: NewCardFields.
 * Depends on: react, api/use-card-board, api/describe-error, components/ui/{field,picker},
 *   components/cards/links-field, domain/new-card-form, schemas/new-card (limits),
 *   types/new-card.types.
 */

import { useMemo } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useCardBoard } from '#/api/use-card-board.js';
import { LinksField } from '#/components/cards/links-field.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';
import { PRIORITY_ITEMS, TYPE_ITEMS, openCardItems } from '#/domain/new-card-form.js';
import { TITLE_MAX } from '#/schemas/new-card.js';
import type { NewCardType } from '#/schemas/new-card.js';
import type { CardPriority } from '#/schemas/cards.js';
import type {
  NewCardField,
  NewCardForm,
  NewCardProblems,
} from '#/types/new-card.types.js';

export function NewCardFields(props: {
  slug: string;
  form: NewCardForm;
  onChange: (change: Partial<NewCardForm>) => void;
  /** Problems to show now (already filtered to the fields that have been left). */
  problems: NewCardProblems;
  onLeave: (field: NewCardField) => void;
  disabled: boolean;
}) {
  const { form, problems, disabled } = props;
  const board = useCardBoard(props.slug);
  const items = useMemo(() => openCardItems(board.cards), [board.cards]);
  const loadError = board.query.isError
    ? describeError(board.query.error).title
    : undefined;

  const picker = {
    items,
    searchable: true,
    loading: board.query.isPending,
    disabled,
    emptyText: 'No open cards in this project yet',
    error: loadError ? `${loadError}. Cards could not be loaded.` : undefined,
  } as const;

  return (
    <div className="grid gap-5">
      <Field id="new-card-title" label="Title" error={problems.title}>
        <input
          id="new-card-title"
          type="text"
          autoComplete="off"
          // The first field is where the user starts typing.
          autoFocus
          value={form.title}
          disabled={disabled}
          maxLength={TITLE_MAX + 40}
          aria-invalid={problems.title !== undefined || undefined}
          aria-describedby={problems.title ? 'new-card-title-error' : undefined}
          onChange={(event) => props.onChange({ title: event.target.value })}
          onBlur={() => props.onLeave('title')}
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        id="new-card-description"
        label="Description"
        hint="What do you want, and why? The Director will ask the rest. Markdown works."
        error={problems.description}
      >
        <textarea
          id="new-card-description"
          rows={6}
          value={form.description}
          disabled={disabled}
          aria-invalid={problems.description !== undefined || undefined}
          aria-describedby={`new-card-description-hint${problems.description ? ' new-card-description-error' : ''}`}
          onChange={(event) => props.onChange({ description: event.target.value })}
          onBlur={() => props.onLeave('description')}
          className={`${INPUT_CLASS} min-h-32 resize-y`}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="new-card-type" label="Type">
          <Picker
            id="new-card-type"
            items={TYPE_ITEMS}
            value={form.type}
            disabled={disabled}
            onChange={(type) => props.onChange({ type: type as NewCardType })}
          />
        </Field>
        <Field id="new-card-priority" label="Priority">
          <Picker
            id="new-card-priority"
            items={PRIORITY_ITEMS}
            value={form.priority}
            disabled={disabled}
            onChange={(priority) =>
              props.onChange({ priority: priority as CardPriority })
            }
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="new-card-depends-on"
          label="Depends on"
          hint="Cards that must finish first."
          error={problems.dependsOn}
        >
          <Picker
            {...picker}
            multiple
            id="new-card-depends-on"
            value={form.dependsOn}
            placeholder="None"
            onChange={(dependsOn) => props.onChange({ dependsOn })}
          />
        </Field>
        <Field
          id="new-card-blocks"
          label="Blocks"
          hint="Cards that wait for this one."
          error={problems.blocks}
        >
          <Picker
            {...picker}
            multiple
            id="new-card-blocks"
            value={form.blocks}
            placeholder="None"
            onChange={(blocks) => props.onChange({ blocks })}
          />
        </Field>
      </div>

      <LinksField
        id="new-card-links"
        links={form.links}
        disabled={disabled}
        onChange={(links) => props.onChange({ links })}
      />
    </div>
  );
}
