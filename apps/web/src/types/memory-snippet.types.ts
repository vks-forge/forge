/**
 * Shape of one piece of a cut search snippet.
 *
 * Why: the results list draws a snippet as plain pieces, some marked as matched words; the
 *   domain function that cuts the text and the component that draws it share this one shape.
 *
 * Exports: SnippetPart.
 * Depends on: nothing. Types only.
 */

export interface SnippetPart {
  readonly text: string;
  readonly marked: boolean;
}
