/**
 * Gate config files that matter in every ecosystem.
 *
 * Why: some files steer verification whatever the language: `.gitattributes` can hide a
 *   test diff from G1, and `Makefile` or `justfile` often hold the project's test target.
 *   They stay guarded even when a project replaces the ecosystem rules, because losing
 *   them would let a Worker blind the gate.
 *
 * Exports: COMMON_CONFIG_GLOBS.
 * Depends on: none. No IO.
 */

export const COMMON_CONFIG_GLOBS: readonly string[] = [
  '.gitattributes',
  'makefile',
  'justfile',
];
