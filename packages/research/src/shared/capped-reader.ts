/**
 * Byte-capped stream reader.
 *
 * Why: both outbound routes a Worker can trigger (`web_fetch` pages, `web_search` answers
 *   from SearXNG) read bodies written by someone else. Buffering the whole body before
 *   checking its size lets a hostile or broken server exhaust memory, so every read
 *   stops pulling at the cap and tells the source to abandon the rest.
 *
 * Exports: readCapped().
 * Depends on: Buffer only. No IO of its own (reads the stream it is given).
 */

/**
 * Reads at most `max` bytes from `body`. When the stream holds more, stops pulling,
 * calls `abandon()` (destroy/cancel the source) and reports `truncated`.
 */
export async function readCapped(
  body: AsyncIterable<Uint8Array>,
  max: number,
  abandon: () => unknown,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of body) {
    const room = max - total;
    if (chunk.length > room) {
      chunks.push(chunk.subarray(0, room));
      total += room;
      truncated = true;
      break;
    }

    chunks.push(chunk);
    total += chunk.length;
  }

  if (truncated) {
    await abandon();
  }

  return { bytes: Buffer.concat(chunks), truncated };
}
