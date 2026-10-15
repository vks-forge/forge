/**
 * Ecosystem registry — every known ecosystem's rule data by id.
 *
 * Why: projects name ecosystems by id (`node`, `go`) in settings, and the gates must turn
 *   those ids into rules without a chain of `if`s. One table keeps "add a language" to
 *   one new data file plus one line here.
 *
 * Exports: ECOSYSTEMS, ecosystemById().
 * Depends on: domain/ecosystems/*, types/ecosystem. No IO.
 */

import { CMAKE_RULES } from '#/domain/ecosystems/cmake.js';
import { DOTNET_RULES } from '#/domain/ecosystems/dotnet.js';
import { GO_RULES } from '#/domain/ecosystems/go.js';
import { JVM_RULES } from '#/domain/ecosystems/jvm.js';
import { NODE_RULES } from '#/domain/ecosystems/node.js';
import { PHP_RULES } from '#/domain/ecosystems/php.js';
import { PYTHON_RULES } from '#/domain/ecosystems/python.js';
import { RUBY_RULES } from '#/domain/ecosystems/ruby.js';
import { RUST_RULES } from '#/domain/ecosystems/rust.js';
import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const ECOSYSTEMS: readonly EcosystemRules[] = [
  NODE_RULES,
  PYTHON_RULES,
  GO_RULES,
  RUST_RULES,
  JVM_RULES,
  DOTNET_RULES,
  RUBY_RULES,
  PHP_RULES,
  CMAKE_RULES,
];

/** The rules for `id` (case-insensitive), or undefined for an ecosystem Forge has no data for. */
export function ecosystemById(id: string): EcosystemRules | undefined {
  const wanted = id.trim().toLowerCase();

  return ECOSYSTEMS.find((e) => e.id === wanted);
}
