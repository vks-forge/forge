/**
 * DirectorStatus: what the Director is doing right now, at the end of the chat.
 *
 * Why: after the owner answers, or right after a card is created, nothing visible happens for
 *   several seconds while the Director reads files and thinks; without a sign the owner wonders
 *   whether the click worked. This shows the one state that applies: "thinking" with the label
 *   of the running step ("Reading the project"), "reading the project" on a new card before its
 *   first message, or the Director's failure in words with what to do. The pulse is decoration
 *   only (it stops under reduced motion); the words carry the meaning. Whether it is thinking is
 *   decided by the page (the server's status first; a step with no end never counts while something
 *   waits on the owner), and a step the server recorded as failed says so even when no chat reply
 *   failed.
 *
 * Exports: DirectorStatus.
 * Depends on: react.
 */

export function DirectorStatus(props: {
  state: 'idle' | 'thinking' | 'error';
  /** Label of the running step, when there is one. */
  step: string | null;
  /** The page's verdict: the Director is working (see domain/director-flow `isThinking`). */
  thinking?: boolean;
  /** The Director's newest step ended as failed. */
  stepFailed?: boolean;
  /** A new card the Director has not spoken on yet. */
  reading: boolean;
  lastError: string | null | undefined;
}) {
  const pulse = (
    <span
      aria-hidden="true"
      className="size-2 animate-pulse rounded-full bg-signal motion-reduce:animate-none"
    />
  );

  return (
    <>
      {(props.thinking ?? (props.state === 'thinking' || props.step !== null)) ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {pulse}
          The Director is thinking…
          {props.step !== null ? (
            <span className="text-xs text-faint">{props.step}</span>
          ) : null}
        </p>
      ) : null}
      {props.reading &&
      props.state !== 'thinking' &&
      props.step === null &&
      props.thinking !== true ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          {pulse}
          Director is reading the project…
        </p>
      ) : null}
      {props.state !== 'error' && props.stepFailed === true && props.thinking !== true ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          The Director could not finish its last step. Send a message to try again.
        </p>
      ) : null}
      {props.state === 'error' ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          The Director hit a problem
          {props.lastError ? `: ${props.lastError}` : '.'} Send another message to try
          again.
        </p>
      ) : null}
    </>
  );
}
