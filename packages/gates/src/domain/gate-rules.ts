/**
 * Gate rules — which ecosystems apply to a project and the rules they add up to.
 *
 * Why: G1 judges repos in any language (d-0095). Config-guard, the test-file test and the
 *   test-weakening rules differ per ecosystem, and one repo can mix several (a Go service
 *   with a Node frontend). This turns the project's settings into one resolved rule set:
 *   the ecosystems it names, or, when it names none, the ones its diff and check commands
 *   show, and every ecosystem when nothing shows (fail closed: more files guarded, never
 *   fewer). Project `gate_rules` add to the data or replace it per list, so a repo with an
 *   unusual layout can say so without a code change.
 *
 * Exports: detectEcosystems(), resolveRules(), ALL_RULES.
 * Depends on: @forge/core (globMatch, ProjectConfig), domain/ecosystems/*, shared/paths, types/ecosystem. No IO.
 */

import { globMatch } from '@forge/core';
import type { ProjectConfig } from '@forge/core';
import { COMMON_CONFIG_GLOBS } from '#/domain/ecosystems/common.js';
import { ECOSYSTEMS, ecosystemById } from '#/domain/ecosystems/registry.js';
import { foldPath } from '#/shared/paths.js';
import type { EcosystemRules, ResolvedRules } from '#/types/ecosystem.types.js';

const firstWord = (command: string): string =>
  (command.trim().split(/\s+/)[0] ?? '').toLowerCase();

/** Ids of the ecosystems that `paths` (a diff's files) or the first words of `commands` point at. */
export function detectEcosystems(
  paths: readonly string[],
  commands: readonly string[] = [],
): string[] {
  const words = new Set(commands.map(firstWord));
  const folded = paths.map((p) => foldPath(p));

  return ECOSYSTEMS.filter(
    (e) =>
      e.tools.some((t) => words.has(t)) ||
      folded.some((p) =>
        [...e.detect, ...e.configGlobs].some((g) => globMatch(g, p, true)),
      ),
  ).map((e) => e.id);
}

function union(parts: readonly EcosystemRules[]): ResolvedRules {
  return {
    ecosystems: parts.map((e) => e.id),
    configGlobs: [...COMMON_CONFIG_GLOBS, ...parts.flatMap((e) => e.configGlobs)],
    testGlobs: parts.flatMap((e) => e.testGlobs),
    testContent: parts.flatMap((e) => e.testContent),
    declarations: parts.flatMap((e) => e.declarations),
    skipMarkers: parts.flatMap((e) => e.skipMarkers),
    assertions: parts.flatMap((e) => e.assertions),
    weakExpect: parts.some((e) => e.weakExpect === true),
  };
}

/** Every known ecosystem: what applies when nothing says which ecosystems a repo uses. */
export const ALL_RULES: ResolvedRules = union(ECOSYSTEMS);

/** `base` with the project's additions, or replaced by them when `replace` is set and the list is non-empty. */
function layer<T>(base: readonly T[], extra: readonly T[], replace: boolean): T[] {
  return replace && extra.length > 0 ? [...extra] : [...base, ...extra];
}

/**
 * The rules for one gate run. Ecosystems named in settings win; otherwise they are
 * detected from `paths` and the check commands; if neither says, all apply.
 */
export function resolveRules(
  project: Pick<ProjectConfig, 'ecosystems' | 'checks' | 'gate_rules'>,
  paths: readonly string[],
): ResolvedRules {
  const named = project.ecosystems
    .map((id) => ecosystemById(id))
    .filter((e): e is EcosystemRules => e !== undefined);

  const detected = detectEcosystems(
    paths,
    project.checks.map((c) => c.command),
  );

  const chosen = named.length > 0 ? named : detected.map((id) => ecosystemById(id));
  const parts = chosen.filter((e): e is EcosystemRules => e !== undefined);
  const base = parts.length > 0 ? union(parts) : ALL_RULES;
  const custom = project.gate_rules;
  if (custom === undefined) {
    return base;
  }

  const replace = custom.replace;
  const common = COMMON_CONFIG_GLOBS;
  const extraConfig = custom.config_globs;
  const configGlobs =
    replace && extraConfig.length > 0
      ? [...common, ...extraConfig]
      : layer(base.configGlobs, extraConfig, false);

  return {
    ...base,
    configGlobs,
    testGlobs: layer(base.testGlobs, custom.test_globs, replace),
    skipMarkers: layer(
      base.skipMarkers,
      custom.skip_patterns.map((p) => new RegExp(p)),
      replace,
    ),
  };
}
