/**
 * Legacy company settings migration — turns `engine.global_slots` into `engine.max_concurrent_global`.
 *
 * Why: company settings are stored as immutable numbered versions (d-0085), and every
 *   install that saved a Worker limit before layered limits (d-0097) holds a version that
 *   says `global_slots`. Rewriting history would break the record of what a past run used,
 *   and refusing the old key would make an upgraded install fail to read its own settings.
 *   Every reader converts on the way in instead, so the owner's limit survives the rename;
 *   a document that already carries the new key keeps it, and the old key is dropped.
 *
 * Exports: migrateLegacyCompanyDoc().
 * Depends on: none. Pure; no IO.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The document with `engine.global_slots` renamed to `engine.max_concurrent_global`; anything else is returned as is. */
export function migrateLegacyCompanyDoc(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw['engine']) || !('global_slots' in raw['engine'])) {
    return raw;
  }

  const { global_slots: legacy, ...engine } = raw['engine'];
  if (engine['max_concurrent_global'] === undefined && legacy !== undefined) {
    engine['max_concurrent_global'] = legacy;
  }

  return { ...raw, engine };
}
