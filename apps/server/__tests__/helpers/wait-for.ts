/**
 * Polls a condition until it holds or a deadline passes.
 *
 * Why: the server advances tickets in the background (ticks, runs, gate jobs), so an
 *   end-to-end test cannot call a function and read the result; it has to wait for the
 *   state it expects. A named timeout with the last observed value in the message turns
 *   "the test hung" into "the ticket stayed in verifying", which is what a reader needs.
 *
 * Exports: waitFor().
 * Depends on: none. No IO of its own (timers).
 */

/** Resolves with the first truthy value of `probe`; rejects with `what` and the last error after `timeoutMs`. */
export async function waitFor<T>(
  what: string,
  probe: () => Promise<T | false | null | undefined> | T | false | null | undefined,
  timeoutMs = 60_000,
  intervalMs = 50,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      const value = await probe();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${timeoutMs} ms waiting for ${what}${
          lastError ? ` (last error: ${String(lastError)})` : ''
        }`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
