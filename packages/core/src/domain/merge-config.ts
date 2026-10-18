/**
 * mergeConfig — the one door from stored overrides to effective settings.
 *
 * Why: the engine runs on the merge of three layers: built-in defaults, the company's
 *   overrides, then the project's. If each caller merged them its own way, one tick could
 *   see a project's limit and another the company's. This pure function fixes the rule:
 *   objects merge key by key, everything else (including lists) is replaced whole, the
 *   project wins over the company, and the result is validated against the full schemas,
 *   so a stored override that no longer fits (a dial removed in a release) fails loudly
 *   instead of running the engine on a half-valid config. A project may only lower the
 *   Director's own sign-off ceiling (`director.sign_off.max_tier`): the company's value is the
 *   most trust it will ever give, so the save door refuses a project value above it
 *   (`signOffAboveCeiling`), and a stored one the company later lowered under is held to the
 *   company's value when merged, never trusted above it.
 *
 * Exports: mergeConfig(), mergeCompany(), signOffAboveCeiling().
 * Depends on: schemas/config-override, schemas/forge-config, shared/errors. No IO.
 */

import {
  CompanyOverride,
  EffectiveConfig,
  ProjectOverride,
} from '#/schemas/config-override.js';
import { ForgeConfig } from '#/schemas/forge-config.js';
import { InvalidInputError } from '#/shared/errors.js';

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `base` with `over` laid on top: plain objects merge recursively, any other value replaces. */
function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) {
    return base;
  }

  if (!isPlain(base) || !isPlain(over)) {
    return over;
  }

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = deepMerge(base[key], value);
  }

  return out;
}

function parseOr<T>(schema: { parse(v: unknown): T }, value: unknown, what: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new InvalidInputError(`${what} is not valid`, { cause: error });
  }
}

/**
 * Effective settings for a project: `defaults`, then `company`, then `project`.
 * Throws `InvalidInputError` when an override has unknown or ill-typed keys or the merged
 * result fails the full schemas.
 */
export function mergeConfig(
  defaults: EffectiveConfig,
  company: CompanyOverride = {},
  project: ProjectOverride = {},
): EffectiveConfig {
  const c = parseOr(CompanyOverride, company, 'company override');
  const p = parseOr(ProjectOverride, project, 'project override');
  // The project's `director` overrides lay over the company's, so the engine reads one
  // effective `forge.director` per project (d-0150); the partial itself stays on the project.
  const companyForge = deepMerge(defaults.forge, c);
  const merged = {
    forge: isPlain(companyForge)
      ? {
          ...companyForge,
          director: clampSignOff(
            deepMerge(companyForge['director'], p.director),
            companyForge['director'],
          ),
        }
      : companyForge,
    project: deepMerge(defaults.project, p),
  };

  return parseOr(EffectiveConfig, merged, 'effective config');
}

const SIGN_OFF_RANK: Readonly<Record<string, number>> = { none: 0, A: 1, B: 2 };

const signOffTier = (director: unknown): string | undefined => {
  const signOff = isPlain(director) ? director['sign_off'] : undefined;
  const tier = isPlain(signOff) ? signOff['max_tier'] : undefined;

  return typeof tier === 'string' ? tier : undefined;
};

/**
 * The reason a project's `director.sign_off.max_tier` is not allowed, or undefined: a project may
 * only lower the company's ceiling, never raise it. `company` is the company's effective settings
 * (with a `director` key) and `projectDirector` the project's own `director` override.
 */
export function signOffAboveCeiling(
  company: unknown,
  projectDirector: unknown,
): string | undefined {
  const own = signOffTier(projectDirector);
  const ceiling = signOffTier(isPlain(company) ? company['director'] : undefined);
  if (own === undefined || ceiling === undefined) {
    return undefined;
  }

  return (SIGN_OFF_RANK[own] ?? 0) > (SIGN_OFF_RANK[ceiling] ?? 0)
    ? `a project may only lower the Director's sign-off ceiling (company: ${ceiling}, project: ${own})`
    : undefined;
}

/** The merged Director section with its sign-off ceiling held to the company's (a value stored before the company lowered it never raises it). */
function clampSignOff(merged: unknown, company: unknown): unknown {
  const ceiling = signOffTier(company);
  const tier = signOffTier(merged);
  if (
    !isPlain(merged) ||
    ceiling === undefined ||
    tier === undefined ||
    (SIGN_OFF_RANK[tier] ?? 0) <= (SIGN_OFF_RANK[ceiling] ?? 0)
  ) {
    return merged;
  }

  return {
    ...merged,
    sign_off: { ...(merged['sign_off'] as object), max_tier: ceiling },
  };
}

/** Company-wide settings only: `defaults.forge` with the company override on top. */
export function mergeCompany(
  defaults: ForgeConfig,
  company: CompanyOverride = {},
): ForgeConfig {
  const c = parseOr(CompanyOverride, company, 'company override');

  return parseOr(ForgeConfig, deepMerge(defaults, c), 'company config');
}
