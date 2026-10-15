/**
 * Card chat rule results.
 *
 * Why: the card type rules answer with a typed refusal that the HTTP route turns into a
 *   status and the chat engine turns into a plain note, so neither parses message text.
 *
 * Exports: TypeChangeCheck.
 * Depends on: none. Types only.
 */

/** Whether a card may be re-filed under another type; `code` names the refusal. */
export type TypeChangeCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: 'unknown_card_type' | 'card_type_source';
      readonly message: string;
    };
