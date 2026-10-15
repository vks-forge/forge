/**
 * Record ids — the next sequential id for a folder family.
 *
 * Why: ids are how decisions are cited and superseded, so two records must never share
 *   one. A proposal keeps its `x-` id when it is approved or rejected and moves folder,
 *   which means the highest `x-` id can leave `proposed/`; counting only that folder
 *   would hand the same number out again. The next id therefore looks at every id of the
 *   family in the whole repository.
 *
 * Exports: nextRecordId().
 * Depends on: nothing. Pure, no IO.
 */

/** `prefix` is one letter (`d`, `x`, `o`); `existing` is every id found anywhere in the repository. */
export function nextRecordId(prefix: string, existing: readonly string[]): string {
  let highest = 0;
  for (const id of existing) {
    const match = new RegExp(`^${prefix}-(\\d{4})$`).exec(id);
    const n = match?.[1] === undefined ? 0 : Number(match[1]);
    if (n > highest) {
      highest = n;
    }
  }

  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}
