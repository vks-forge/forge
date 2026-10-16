/**
 * NewCardButton: the one way to start a card, with its popup.
 *
 * Why: starting work used to be a free-text box on the Board and Home; the Director now needs a
 *   title, a description and the card's place among other cards before it can plan, so the
 *   entry point is a button that opens the New card popup. The Board header, Home and the empty
 *   Board all need it with their own wording, so the button owns its popup and each place only
 *   says where it sits and what it is called. An archived project takes no new work: the
 *   button stays, disabled, with the reason on hover and focus.
 *
 * Exports: NewCardButton.
 * Depends on: react, lucide-react, components/cards/new-card-dialog, components/ui/{button,tooltip},
 *   routes/board/archived-reason, state/project-archived.
 */

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { NewCardDialog } from '#/components/cards/new-card-dialog.js';
import { Button } from '#/components/ui/button.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { ARCHIVED_REASON } from '#/routes/board/archived-reason.js';
import { useProjectArchived } from '#/state/project-archived.js';

export function NewCardButton(props: {
  slug: string;
  /** The button's words; default "New card". */
  label?: string;
  variant?: 'primary' | 'quiet';
}) {
  const [open, setOpen] = useState(false);
  const archived = useProjectArchived();

  return (
    <>
      <Tooltip content={ARCHIVED_REASON} disabled={!archived}>
        <span className="inline-flex">
          <Button
            variant={props.variant ?? 'quiet'}
            disabled={archived}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Plus aria-hidden="true" className="size-4" />
            {props.label ?? 'New card'}
          </Button>
        </span>
      </Tooltip>
      <NewCardDialog slug={props.slug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
