/**
 * Shapes of the header menu on the Card and Ticket pages.
 *
 * Why: both pages keep their rare, consequential edits (change type, close) behind one
 *   overflow menu instead of loose controls in the header row. The menu is data, so each
 *   page lists its own entries and the shared component only draws them.
 *
 * Exports: HeaderMenuEntry.
 * Depends on: none. Types only.
 */

/** A heading, a divider or one selectable row of the header menu. */
export type HeaderMenuEntry =
  | { readonly kind: 'label'; readonly key: string; readonly text: string }
  | { readonly kind: 'separator'; readonly key: string }
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly label: string;
      readonly onSelect: () => void;
      /** The row that is already in effect: shown checked and not selectable. */
      readonly current?: boolean;
      readonly tone?: 'danger';
    };
