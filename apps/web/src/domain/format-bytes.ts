/**
 * Writes a byte count the way a person reads it: `12 MB`, `1.4 GB`.
 *
 * Why: the git step tells the person how big a first snapshot would be before they agree to
 *   it; "52428800" says nothing, "50 MB" does. Powers of 1024, one decimal only below 10.
 *   Pure, no IO.
 *
 * Exports: formatBytes().
 * Depends on: none. No IO.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const text =
    value >= 10 || unit === 0 ? Math.round(value).toString() : value.toFixed(1);

  return `${text} ${UNITS[unit]}`;
}
