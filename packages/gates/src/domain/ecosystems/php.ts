/**
 * PHP gate rules.
 *
 * Why: PHP suites are shaped by `phpunit.xml`, `phpcs.xml` and `phpstan.neon`, and a test
 *   is silenced with `markTestSkipped()`. A Worker that edits those makes `phpunit` and
 *   `phpcs` pass without proving the change. `composer.json` is not guarded: dependencies
 *   are ordinary work.
 *
 * Exports: PHP_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const PHP_RULES: EcosystemRules = {
  id: 'php',
  detect: ['composer.json', 'composer.lock', '*.php'],
  tools: ['composer', 'phpunit', 'phpcs', 'phpstan', 'psalm', 'pest'],
  configGlobs: [
    'phpunit.xml',
    'phpunit.xml.dist',
    'phpcs.xml',
    'phpcs.xml.dist',
    'phpstan.neon',
    'phpstan.neon.dist',
    'psalm.xml',
    '.php-cs-fixer.php',
    '.php-cs-fixer.dist.php',
  ],
  testGlobs: ['**/tests/**', '*Test.php'],
  testContent: [],
  declarations: [
    /^\s*(?:public\s+)?function\s+(\w+)\s*\(/,
    /^\s*(?:it|test)\s*\(\s*(['"])((?:(?!\1).)*)/,
  ],
  skipMarkers: [/->markTest(?:Skipped|Incomplete)\s*\(/, /->(?:skip|todo)\s*\(/],
  assertions: [/\$this->assert\w*\s*\(|\bassert\w*\s*\(|\bexpect\s*\(/],
};
