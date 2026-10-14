/**
 * A minimal SSE reader over `fetch`, for tests.
 *
 * Why: the event stream is hand-written (d-0061), so the tests must read it the way a real
 *   client does: split frames on blank lines, take `id`, `event` and `data`, ignore
 *   comments. Reading through `fetch` also proves the headers and the chunked body are
 *   valid HTTP, which a direct call to the stream function would not.
 *
 * Exports: SseFrame, readSse().
 * Depends on: none. IO: one HTTP request.
 */

export interface SseFrame {
  readonly id?: string;
  readonly event?: string;
  readonly data?: string;
  /** Comment frames (`: heartbeat`) carry only this. */
  readonly comment?: string;
}

function parseFrame(raw: string): SseFrame {
  const frame: { id?: string; event?: string; data?: string; comment?: string } = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) {
      frame.comment = line.slice(1).trim();
    } else if (line.startsWith('id: ')) {
      frame.id = line.slice(4);
    } else if (line.startsWith('event: ')) {
      frame.event = line.slice(7);
    } else if (line.startsWith('data: ')) {
      frame.data = line.slice(6);
    }
  }

  return frame;
}

/**
 * GETs `url` and collects frames until the server ends the stream, `stopAfter` frames
 * with an `id` arrived, or `signal` aborts. Returns the frames read so far.
 */
export async function readSse(
  url: string,
  options: { lastEventId?: string; stopAfter?: number; signal?: AbortSignal } = {},
): Promise<{ status: number; contentType: string; frames: SseFrame[] }> {
  const res = await fetch(url, {
    headers: options.lastEventId ? { 'last-event-id': options.lastEventId } : {},
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const frames: SseFrame[] = [];
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.body || res.status !== 200) {
    return { status: res.status, contentType, frames };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        frames.push(parseFrame(buffer.slice(0, end)));
        buffer = buffer.slice(end + 2);
      }

      if (
        options.stopAfter !== undefined &&
        frames.filter((f) => f.id !== undefined).length >= options.stopAfter
      ) {
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return { status: res.status, contentType, frames };
}
