/**
 * CardHeader: who this card is, where it stands and what it has cost, in one row, plus the two
 *   things a person may change behind a menu.
 *
 * Why: on arrival the owner needs the card's title, one status (amber only when it waits on
 *   them) and what it has cost so far, and then the chat; the page below scrolls, this does not.
 *   The two edits the server allows are both consequential, so they sit behind the `⋯` menu and
 *   each still asks first in words that say what will happen: changing the type tells the
 *   Director to treat the card differently and is written to its history; closing requires a
 *   reason (it is recorded and shown to everyone who opens the card later) and cannot be undone
 *   from here. The column itself is never an input, it follows the card's tickets and questions
 *   (d-0107). A closed card says so in its pill and shows its reason on a line under the row, and
 *   a refused change is explained in plain words with the card left as it was.
 *
 * Exports: CardHeader.
 * Depends on: react, @forge/core (types), api/use-card, api/describe-error, components/card/*,
 *   components/cost/cost-chip, components/ui/confirm-dialog, components/work/*,
 *   domain/card-columns, domain/card-phase, domain/cost-display, domain/nav-entries.
 */

import type { CardType, CardTypeName } from '@forge/core';
import { LayoutPanelLeft } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import type { usePatchCard } from '#/api/use-card.js';
import { labelOfType } from '#/components/card/card-type-icon.js';
import { CostChip } from '#/components/cost/cost-chip.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { HeaderMenu } from '#/components/work/header-menu.js';
import { StatusPill } from '#/components/work/status-pill.js';
import { WorkHeader } from '#/components/work/work-header.js';
import { COLUMN_LABEL } from '#/domain/card-columns.js';
import { phaseLine } from '#/domain/card-phase.js';
import { cardCostSplit } from '#/domain/cost-display.js';
import { projectPath } from '#/domain/nav-entries.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type { CardDetailReply } from '#/schemas/cards.js';
import type { HeaderMenuEntry } from '#/types/work-header.types.js';

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
  /** Where the sheet button goes (screens under 1024 px); absent when the rail or tabs show. */
  contextTo?: string | undefined;
  /** The slim needs-you alert, drawn right under the title row. */
  alert?: ReactNode;
}) {
  const { card, types, patch } = props;
  const notify = useNotify();
  const [nextType, setNextType] = useState<CardTypeName | null>(null);
  const closed = card.closed_reason !== undefined;
  const needsYou = !closed && card.column === 'needs_you';
  const phase = phaseLine(card);

  // A type the registry no longer lists stays visible as the current value.
  const typeNames = [
    ...(types?.some((type) => type.name === card.type) ? [] : [card.type]),
    ...(types ?? []).map((type) => type.name),
  ];

  const entries: readonly HeaderMenuEntry[] = [
    { kind: 'label', key: 'type-label', text: 'Change type' },
    ...typeNames.map((name): HeaderMenuEntry => ({
      kind: 'item',
      key: `type-${name}`,
      label: labelOfType(types, name),
      current: name === card.type,
      onSelect: () => setNextType(name),
    })),
    { kind: 'separator', key: 'sep' },
    {
      kind: 'item',
      key: 'close',
      label: 'Close card…',
      tone: 'danger',
      onSelect: props.onClose,
    },
  ];

  return (
    <>
      <WorkHeader
        backTo={projectPath(card.project, 'board')}
        backLabel="Board"
        id={card.id}
        title={card.title}
        status={
          closed ? (
            <StatusPill tone="neutral" label="Closed" />
          ) : needsYou ? (
            <StatusPill tone="attn" label="Needs you" detail={phase} />
          ) : (
            <StatusPill tone="neutral" label={phase ?? COLUMN_LABEL[card.column]} />
          )
        }
        cost={
          <CostChip
            usd={card.cost?.total_usd ?? card.cost_usd}
            recorded={(card.cost?.total_usd ?? card.cost_usd ?? 0) > 0}
            label="Cost of this card"
            {...(card.cost === undefined ? {} : { split: cardCostSplit(card.cost) })}
          />
        }
        context={
          props.contextTo === undefined ? undefined : (
            <Link
              to={props.contextTo}
              aria-label="Plan and details"
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium hover:bg-hover"
            >
              <LayoutPanelLeft aria-hidden="true" className="size-4" />
              <span className="hidden min-[420px]:inline">Plan and details</span>
            </Link>
          )
        }
        menu={closed ? undefined : <HeaderMenu label="Card actions" entries={entries} />}
      />

      {props.alert}

      {closed ? (
        <p className="shrink-0 rounded-xl border border-line bg-surface p-2.5 text-sm">
          <span className="font-medium">Closed.</span> {card.closed_reason}
        </p>
      ) : null}

      {patch.isError ? (
        <p role="alert" className="shrink-0 rounded-lg bg-danger-soft p-3 text-sm">
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
            patch.mutate(
              { type: nextType },
              { onSuccess: () => notify.success('Card type changed') },
            );
          }

          setNextType(null);
        }}
      />
    </>
  );
}
