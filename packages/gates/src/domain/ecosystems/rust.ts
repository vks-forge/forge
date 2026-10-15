/**
 * Rust gate rules.
 *
 * Why: Rust tests sit in `tests/` and in `#[cfg(test)]` modules inside source files, so a
 *   path rule alone would miss most of them; a test is silenced with `#[ignore]`.
 *   Format and lint strictness come from `rustfmt.toml`, `clippy.toml` and Cargo config.
 *   `Cargo.toml` is not guarded because dependency changes are ordinary work.
 *
 * Exports: RUST_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const RUST_RULES: EcosystemRules = {
  id: 'rust',
  detect: ['Cargo.toml', 'Cargo.lock', '*.rs'],
  tools: ['cargo', 'rustc', 'rustfmt', 'clippy-driver'],
  configGlobs: [
    '**/.cargo/config.toml',
    '**/.cargo/config',
    'rustfmt.toml',
    '.rustfmt.toml',
    'clippy.toml',
    '.clippy.toml',
    'rust-toolchain',
    'rust-toolchain.toml',
    'deny.toml',
  ],
  testGlobs: ['**/tests/**'],
  testContent: [/#\[(?:\w+::)?test\b/, /#\[cfg\(test\)\]/, /#\[ignore\b/],
  declarations: [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/],
  skipMarkers: [/#\[ignore\b/],
  assertions: [/\bassert(?:_eq|_ne|_matches)?!/],
};
