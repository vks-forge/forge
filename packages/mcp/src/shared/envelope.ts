/**
 * Untrusted-content envelope.
 *
 * Why: fetched pages are attacker-controlled text that the Worker's model will read.
 *   Wrapping it in a delimiter carrying a random per-call id marks where untrusted text
 *   begins and ends; since the page cannot know the id and any copy of the closing
 *   delimiter inside it is defanged, it cannot forge an early close and pass its own
 *   text off as tool output (tool-system.md §8, §9).
 *
 * Exports: wrapUntrusted().
 * Depends on: No IO.
 */

const TAG = 'untrusted-content';

/** Wraps `text` as `<untrusted-content id=… source=…>…</untrusted-content id=…>`. */
export function wrapUntrusted(text: string, id: string, source: string): string {
  const safe = text
    .replaceAll(`<${TAG}`, `<${TAG.replace('-', '_')}`)
    .replaceAll(`</${TAG}`, `</${TAG.replace('-', '_')}`);
  const src = source.replaceAll('"', '%22').replaceAll('\n', ' ');
  return `<${TAG} id="${id}" source="${src}">\n${safe}\n</${TAG} id="${id}">\n`;
}
