/**
 * NewCardDialog: the popup that starts a card.
 *
 * Why: a card is how work reaches the Director, and the Director begins reading the project the
 *   moment one exists, so the form must not let a half-written request through, and must never
 *   file the same request twice. Create stays disabled until the card is valid, so Enter or
 *   Ctrl or Cmd + Enter (for the description) only sends a card that would be accepted; the
 *   popup carries one `dedupe_key` from the moment it opens, so a double click or a retry after
 *   a dropped connection returns the first card instead of a second. A refusal from the server
 *   (a dependency loop, a card closed meanwhile) is shown next to the field it concerns and
 *   keeps everything typed. Leaving with text in the form asks first (the shared Modal). On
 *   success the popup closes, a notice names the card, and the card page opens on its chat,
 *   where the Director's reading shows.
 *
 * Exports: NewCardDialog.
 * Depends on: react, react-router, api/use-card, components/ui/{button,modal},
 *   components/cards/new-card-fields, domain/{new-card-form,card-paths},
 *   state/notify/notify-context, types/new-card.types.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCreateCard } from '#/api/use-card.js';
import { NewCardFields } from '#/components/cards/new-card-fields.js';
import { Button } from '#/components/ui/button.js';
import { Modal } from '#/components/ui/modal.js';
import { cardPath } from '#/domain/card-paths.js';
import {
  EMPTY_NEW_CARD,
  refusalOf,
  toNewCardInput,
  validateNewCard,
} from '#/domain/new-card-form.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type {
  NewCardField,
  NewCardForm,
  NewCardProblems,
} from '#/types/new-card.types.js';

const FORM_ID = 'new-card-form';
/** Fields whose problem waits until the user has left them. */
const AFTER_LEAVING: readonly NewCardField[] = ['title', 'description'];

export function NewCardDialog(props: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const { slug, open, onClose } = props;
  const navigate = useNavigate();
  const notify = useNotify();
  const create = useCreateCard(slug);
  const { reset } = create;
  const [form, setForm] = useState<NewCardForm>(EMPTY_NEW_CARD);
  const [left, setLeft] = useState<readonly NewCardField[]>([]);
  // One key per opening: every retry of this popup is the same request to the server.
  const [dedupeKey, setDedupeKey] = useState(() => crypto.randomUUID());
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setForm(EMPTY_NEW_CARD);
      setLeft([]);
      setDedupeKey(crypto.randomUUID());
    }
  }

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  const all = validateNewCard(form);
  const valid = Object.keys(all).length === 0;
  const refusal = create.isError ? refusalOf(create.error) : undefined;
  const shown: NewCardProblems = {
    ...Object.fromEntries(
      Object.entries(all).filter(
        ([field]) =>
          !AFTER_LEAVING.includes(field as NewCardField) ||
          left.includes(field as NewCardField),
      ),
    ),
    ...(refusal?.field ? { [refusal.field]: refusal.message } : {}),
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY_NEW_CARD);

  const submit = (): void => {
    if (!valid || create.isPending) {
      return;
    }

    create.mutate(toNewCardInput(form, dedupeKey), {
      onSuccess: ({ card }) => {
        onClose();
        notify.success(`Card ${card.id} created`);
        void navigate(cardPath(slug, card.id));
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="large"
      title="New card"
      description="Tell the Director what you want. It reads the project first, then asks what it needs."
      dirty={dirty}
      busy={create.isPending}
      discardTitle="Discard this card?"
      discardDescription="What you typed will be lost. This cannot be undone."
      primary={
        <Button
          type="submit"
          form={FORM_ID}
          variant="primary"
          disabled={!valid}
          aria-describedby={valid ? undefined : 'new-card-description-hint'}
          status={create.isPending ? 'loading' : 'idle'}
        >
          Create card
        </Button>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
        }}
      >
        <NewCardFields
          slug={slug}
          form={form}
          problems={shown}
          disabled={create.isPending}
          onChange={(change) => {
            setForm((current) => ({ ...current, ...change }));
            reset();
          }}
          onLeave={(field) => setLeft((list) => [...list, field])}
        />
        {refusal && refusal.field === undefined ? (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {refusal.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
