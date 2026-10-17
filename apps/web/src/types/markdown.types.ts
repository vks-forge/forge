/**
 * Markdown node tree: the shape the safe markdown subset parses into.
 *
 * Why: Worker messages are untrusted model output that often carries markdown. The page
 *   draws it as React elements from this closed set of node kinds, never as HTML, so
 *   nothing the model writes can inject markup or script. Anything outside the set stays
 *   literal text.
 *
 * Exports: MarkdownInline, MarkdownBlock.
 * Depends on: none. Types only.
 */

/** A run of text inside a block. */
export type MarkdownInline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly children: readonly MarkdownInline[] }
  | { readonly kind: 'italic'; readonly children: readonly MarkdownInline[] }
  | { readonly kind: 'code'; readonly text: string }
  | {
      readonly kind: 'link';
      readonly href: string;
      readonly children: readonly MarkdownInline[];
    };

/** One block of a message. */
export type MarkdownBlock =
  | { readonly kind: 'paragraph'; readonly children: readonly MarkdownInline[] }
  | {
      readonly kind: 'heading';
      readonly level: 1 | 2 | 3;
      readonly children: readonly MarkdownInline[];
    }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly MarkdownInline[])[];
    }
  | { readonly kind: 'code'; readonly text: string };
