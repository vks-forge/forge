/**
 * CardHeader: who this card is, where it stands, and the two things a person may change.
 *
 * Why: on arrival the user needs the card's title, its column (amber only when it waits on
 *   them) and where it came from. The two edits the server allows are both consequential, so
 *   both ask first in words that say what will happen: changing the type tells the Director to
 *   treat the card differently and is written to its history; closing requires a reason (it is
 *   recorded and shown to everyone who opens the card later) and cannot be undone from here. The
 *   column itself is never an input, it follows the card's tickets and questions (d-0107). A
 *   closed card shows its reason where the close button was, and a refused change is explained
 *   in plain words with the card left as it was.
 *
 * Exports: CardHeader.
 * Depends on: react, react-router, lucide-react, @forge/core (types), api/use-card,
 *   api/describe-error, components/card/*, components/ui/*, domain/card-columns,
 *   domain/nav-entries, routes/card/card-details.
 */

import type { CardType, CardTypeName } from '@forge/core';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import type { usePatchCard } from '#/api/use-card.js';
import { CardTypeIcon, labelOfType } from '#/components/card/card-type-icon.js';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { COLUMN_LABEL } from '#/domain/card-columns.js';
import { projectPath } from '#/domain/nav-entries.js';
import { SOURCE_LABEL } from '#/routes/card/card-details.js';
import type { CardDetailReply } from '#/schemas/cards.js';

function patchRefusal(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'card_closed') {
      return 'This card is already closed, so it takes no more changes.';
    }

    if (error.code === 'card_type_source') {
      return 'That type does not accept this card’s source, so the card was left as it was.';
    }
  }

  const { title, detail } = describeError(error);

  return `The change was not made. ${title}. ${detail}`;
}

export function CardHeader(props: {
  card: CardDetailReply;
  types: readonly CardType[] | undefined;
  /** The page's patch mutation, shared with the close dialog it also owns. */
  patch: ReturnType<typeof usePatchCard>;
  /** Opens the close dialog (owned by the page so the chat can open it too). */
  onClose: () => void;
}) {
  const { card, types, patch } = props;
  const [nextType, setNextType] = useState<CardTypeName | null>(null);
  const closed = card.closed_reason !== undefined;
  const needsYou = card.column === 'needs_you';
  const icon = types?.find((type) => type.name === card.type)?.icon;

  return (
    <header className="grid gap-3">
      <Link
        to={projectPath(card.project, 'board')}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Board
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-data text-sm text-muted">{card.id}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
            needsYou ? 'bg-attn-soft text-fg' : 'bg-hover text-muted'
          }`}
        >
          {needsYou ? (
            <CircleAlert aria-hidden="true" className="size-3.5 text-attn" />
          ) : null}
          {COLUMN_LABEL[card.column]}
        </span>
        <span className="text-xs text-muted">from {SOURCE_LABEL[card.source.kind]}</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{card.title}</h1>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="grid gap-1">
          <label htmlFor="card-type" className="text-xs text-muted">
            Type
          </label>
          <div className="flex items-center gap-2">
            <CardTypeIcon icon={icon} />
            <select
              id="card-type"
              value={card.type}
              disabled={closed || patch.isPending}
              onChange={(event) => setNextType(event.target.value)}
              className={`${INPUT_CLASS} w-auto min-w-36`}
            >
              {/* A type the registry no longer lists stays visible as the current value. */}
              {types?.some((type) => type.name === card.type) ? null : (
                <option value={card.type}>{card.type}</option>
              )}
              {(types ?? []).map((type) => (
                <option key={type.name} value={type.name}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {closed ? null : (
          <Button variant="danger" onClick={props.onClose}>
            Close card
          </Button>
        )}
      </div>

      {closed ? (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm">
          <span className="font-medium">Closed.</span> {card.closed_reason}
        </p>
      ) : null}

      {patch.isError ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          {patchRefusal(patch.error)}
        </p>
      ) : null}

      <ConfirmDialog
        open={nextType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNextType(null);
          }
        }}
        title={`Change the type to ${nextType === null ? '' : labelOfType(types, nextType)}?`}
        description={`The Director will treat this card as ${nextType === null ? '' : labelOfType(types, nextType)} instead of ${labelOfType(types, card.type)}. The change is recorded in the card’s history. It does not create or remove tickets.`}
        confirmLabel="Change type"
        onConfirm={() => {
          if (nextType !== null) {
            patch.mutate({ type: nextType });
          }

          setNextType(null);
        }}
      />
    </header>
  );
}
