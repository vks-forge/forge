/**
 * Legacy project settings migration — turns `profile` + `commands` into `checks`.
 *
 * Why: projects registered before checks became a role-tagged list stored their settings
 *   as `profile: ts | generic` plus a `commands` object, and those immutable config
 *   versions stay in the database forever (d-0085). Rewriting history would break the
 *   record of what a past run used, so every reader converts on the way in instead: an
 *   old document yields the same checks it used to run (lint, typecheck, test in that
 *   order, typecheck dropped under `generic`, plus `build`), and every new write already
 *   uses the new shape. Without this, an upgrade would leave old projects with no checks
 *   at all, and G1 would pass them on nothing (d-0095).
 *
 * Exports: migrateLegacyProjectDoc(), legacyProjectDocProblem().
 * Depends on: none. Pure; no IO.
 */

const LEGACY_ORDER = ['lint', 'typecheck', 'test', 'build'] as const;
const PROFILES = new Set(['ts', 'generic']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** True when the document still carries the old keys. */
const isLegacy = (raw: Record<string, unknown>): boolean =>
  'profile' in raw || 'commands' in raw;

/** Why a legacy document cannot be converted (an unknown profile), or null. */
export function legacyProjectDocProblem(raw: unknown): string | null {
  if (!isRecord(raw) || !('profile' in raw) || raw['profile'] === undefined) {
    return null;
  }

  return typeof raw['profile'] === 'string' && PROFILES.has(raw['profile'])
    ? null
    : 'profile must be "ts" or "generic" in a legacy document; use checks and ecosystems';
}

function legacyChecks(commands: unknown, profile: unknown): unknown[] {
  if (!isRecord(commands)) {
    return [];
  }

  const out: unknown[] = [];
  for (const role of LEGACY_ORDER) {
    const command = commands[role];
    if (command === undefined || (role === 'typecheck' && profile === 'generic')) {
      continue;
    }

    out.push({ name: role, role, command });
  }

  return out;
}

/**
 * The document with `profile`/`commands` replaced by `checks` (and `ts` by
 * `ecosystems: ['node']`). A document without the old keys, or one that already has
 * `checks`/`ecosystems`, keeps what it has; the old keys are dropped either way. A legacy
 * override that sets no command gets no `checks` key, so it cannot blank an inherited list.
 */
export function migrateLegacyProjectDoc(raw: unknown): unknown {
  if (!isRecord(raw) || !isLegacy(raw)) {
    return raw;
  }

  const { profile, commands, ...rest } = raw;
  const out: Record<string, unknown> = { ...rest };
  const checks = legacyChecks(commands, profile);
  if (out['checks'] === undefined && checks.length > 0) {
    out['checks'] = checks;
  }

  if (out['ecosystems'] === undefined && profile === 'ts') {
    out['ecosystems'] = ['node'];
  }

  return out;
}
