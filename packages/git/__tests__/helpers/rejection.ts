/**
 * Test helper: the error a promise rejects with.
 *
 * Why: tests that inspect an error's message or fields need it typed as an Error, and a
 *   `.catch(e => e)` yields a union with the success value. This fails the test clearly if
 *   the promise unexpectedly resolves.
 *
 * Exports: rejection().
 * Depends on: none.
 */

/** Awaits `p` and returns what it rejected with; throws if it resolved. */
export async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected the promise to reject');
}
