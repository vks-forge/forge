/**
 * Cuts the biggest strings of an over-size trace entry.
 *
 * Why: a tool can return a whole file and a model can print pages, but one entry must stay
 *   small enough to read, to append in one write and to keep the daily file from ballooning
 *   (d-0163). Dropping the entry would hide exactly the event the owner is looking for, so the
 *   largest string fields are shortened instead, each ending in a marker that says how many
 *   bytes went, and the structure around them is untouched.
 *
 * Exports: fitEntry(), truncationMarker().
 * Depends on: types/trace. No IO.
 */

import type { StringSlot } from '#/types/trace.types.js';

/** Text appended where a string was cut. */
export function truncationMarker(bytes: number): string {
  return `…[truncated ${bytes} bytes]`;
}

function collect(value: unknown, out: StringSlot[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, key) => {
      if (typeof item === 'string') {
        out.push({ holder: value, key, size: Buffer.byteLength(item) });
      } else {
        collect(item, out);
      }
    });
  } else if (value !== null && typeof value === 'object') {
    const holder = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(holder)) {
      if (typeof item === 'string') {
        out.push({ holder, key, size: Buffer.byteLength(item) });
      } else {
        collect(item, out);
      }
    }
  }
}

const read = (slot: StringSlot): string =>
  (slot.holder as Record<string | number, string>)[slot.key] as string;

/** Cuts `text` to at most `keep` bytes without splitting a character. */
function cut(text: string, keep: number): string {
  let end = Math.max(0, keep);
  while (end > 0 && Buffer.byteLength(text.slice(0, end)) > keep) {
    end = Math.floor(end * 0.9);
  }

  return text.slice(0, end);
}

/**
 * The JSON line (no newline) for `entry`, with the biggest strings shortened until it fits
 * `maxBytes`. `entry` is plain JSON (already redacted) and is edited in place.
 */
export function fitEntry(entry: Record<string, unknown>, maxBytes: number): string {
  let json = JSON.stringify(entry);
  for (let round = 0; round < 64 && Buffer.byteLength(json) > maxBytes; round++) {
    const slots: StringSlot[] = [];
    collect(entry, slots);
    const biggest = slots.sort((a, b) => b.size - a.size)[0];
    if (!biggest || biggest.size <= 64) {
      break;
    }

    const over = Buffer.byteLength(json) - maxBytes;
    const text = read(biggest);
    const marker = truncationMarker(0).length + 12;
    const keep = Math.max(32, biggest.size - over - marker);
    const shortened = cut(text, keep);
    const lost = biggest.size - Buffer.byteLength(shortened);
    (biggest.holder as Record<string | number, string>)[biggest.key] =
      shortened + truncationMarker(lost);

    json = JSON.stringify(entry);
  }

  return json;
}
