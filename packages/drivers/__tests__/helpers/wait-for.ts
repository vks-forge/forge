/**
 * Polling helper for tests that must act after an asynchronous milestone.
 *
 * Why: with a manual clock, advancing time before the code under test has armed its timer
 *   makes the timer fire never (or at the wrong moment). Tests therefore wait for an
 *   observable milestone (the adapter received the prompt, the driver asked for a receipt)
 *   and only then move the clock. The wait yields to the event loop instead of sleeping, so
 *   it stays fast and fails with a clear message instead of hanging.
 *
 * Exports: waitFor().
 * Depends on: nothing. No IO.
 */

/** Resolves once `condition()` is true; throws after `timeoutMs` of wall time. */
export async function waitFor(
  condition: () => boolean,
  label = 'condition',
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    // A short real sleep, not just setImmediate: real child processes need wall time.
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`waitFor: ${label} never became true`);
}
