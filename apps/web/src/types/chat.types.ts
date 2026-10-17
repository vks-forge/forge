/**
 * Shapes of the grouped chat transcript.
 *
 * Why: the card chat and the Worker thread draw different items but group them the same way
 *   (one author header and time per run of consecutive messages, a separator when the day
 *   changes). Naming the input and output of that pure grouping keeps it testable alone.
 *
 * Exports: ChatGroupInput, ChatRowMeta.
 * Depends on: nothing. Types only.
 */

/** What grouping needs to know about one transcript item. */
export interface ChatGroupInput {
  /** ISO timestamp of the item. */
  readonly at: string;
  /** Who spoke; null for an item that is not speech (a tool call, a note, a status). */
  readonly author: string | null;
}

/** How one item is drawn relative to its neighbours. */
export interface ChatRowMeta {
  /** Draw the author and time above this item: it starts a group of speech. */
  readonly header: boolean;
  /** Draw this day label above the item: it is the first of a new day. Null otherwise. */
  readonly day: string | null;
}
