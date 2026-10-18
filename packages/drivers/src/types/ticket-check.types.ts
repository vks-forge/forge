/**
 * The artifact shape the check-against-plan prompt reads.
 *
 * Why: the prompt is rendered from `unknown` step input, so each artifact is narrowed to the few
 *   fields the renderer needs before anything is shown; naming that shape keeps the narrowing honest.
 *
 * Exports: TicketCheckArtifact.
 * Depends on: nothing. Types only.
 */

export interface TicketCheckArtifact {
  readonly kind: string;
  readonly content: string;
  readonly truncated?: boolean;
}
