/**
 * Ruby gate rules.
 *
 * Why: Ruby suites are shaped by `.rspec`, `.rubocop.yml` and the `Rakefile`, and a spec
 *   is silenced with `xit`, `pending` or `skip`. A Worker that edits those makes `rspec`
 *   and `rubocop` pass without proving the change. The `Gemfile` is not guarded:
 *   dependencies are ordinary work.
 *
 * Exports: RUBY_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const RUBY_RULES: EcosystemRules = {
  id: 'ruby',
  detect: ['Gemfile', 'Gemfile.lock', '*.gemspec', 'Rakefile', '*.rb'],
  tools: ['bundle', 'rake', 'rspec', 'rubocop', 'standardrb'],
  configGlobs: [
    '.rubocop.yml',
    '.rubocop_todo.yml',
    '.rspec',
    '.rspec_parallel',
    '.standard.yml',
    'Rakefile',
  ],
  testGlobs: ['**/spec/**', '**/test/**', '*_spec.rb', '*_test.rb', 'test_*.rb'],
  testContent: [],
  declarations: [
    /^\s*(?:it|specify|describe|context|test)\s*\(?\s*(['"])((?:(?!\1).)*)/,
    /^\s*def\s+(test_\w+)/,
  ],
  skipMarkers: [
    /^\s*(?:x(?:it|describe|context|specify)|f(?:it|describe|context)|pending|skip)\b/,
    /,\s*(?::skip|skip:|:focus|focus:\s*true)\b/,
  ],
  assertions: [/\bexpect\s*[({]|\bassert\w*\b|\.should\b|\bis_expected\b/],
};
