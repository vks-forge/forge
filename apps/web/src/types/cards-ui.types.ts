/**
 * Shapes of the Cards view and the Card page.
 *
 * Why: the Board's card columns and the chat transcript are derived from server rows. Naming
 *   those derived shapes keeps the pure functions that build them (domain/card-columns,
 *   domain/card-chat) and the components that draw them apart, so each is testable alone.
 *
 * Exports: CardColumnDef, CardFilter, ChatLine, CardTab.
 * Depends on: @forge/core (types), types/board.types. Types only.
 */

import type { CardColumn } from '@forge/core';
import type { ColumnTone } from '#/types/board.types.js';

export interface CardColumnDef {
  readonly id: CardColumn;
  readonly title: string;
  /** Said under the title so a column's meaning needs no manual. */
  readonly hint: string;
  readonly tone: ColumnTone;
}

export interface CardFilter {
  /** A card type name, or `all`. */
  readonly type: string;
  /** Matches id or title, case-insensitive. */
  readonly query: string;
}

/** One line of the chat transcript, derived from a history event or an unsent message. */
export interface ChatLine {
  readonly key: string;
  readonly at: string;
  /** `you` and `director` are speech; `note` is a compact system or action line. */
  readonly tone: 'you' | 'director' | 'note';
  readonly text: string;
  /** Compact lines under a Director message: what it did. */
  readonly actions: readonly string[];
  /** The ticket a note is about, so the line can link to it. */
  readonly ticketId?: string;
  /** True for a line the server has not confirmed yet. */
  readonly pending?: boolean;
}

export type CardTab = 'chat' | 'tickets' | 'details';
