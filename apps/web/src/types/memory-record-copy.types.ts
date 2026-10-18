/**
 * Shapes of the Links section of a record page.
 *
 * Why: a record points at other records, cards and tickets, and each kind of target opens a
 *   different page. The grouping function and the section that links them share these shapes.
 *
 * Exports: LinkTarget, LinkGroup.
 * Depends on: nothing. Types only.
 */

export interface LinkTarget {
  /** What the target is, so the screen can link it to the right page. */
  readonly kind: 'record' | 'card' | 'ticket';
  readonly target: string;
}

export interface LinkGroup {
  readonly label: string;
  readonly items: readonly LinkTarget[];
}
