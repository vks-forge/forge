/**
 * Node and TypeScript gate rules.
 *
 * Why: a Worker on a Node repo can go green by loosening `eslint.config.js`, excluding
 *   files in `vitest.config.ts` or adding `.skip` to a test; these are the files and
 *   markers that make the independent re-run meaningless. They are the rules G1 shipped
 *   with, kept exactly.
 *
 * Exports: NODE_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const NODE_RULES: EcosystemRules = {
  id: 'node',
  detect: [
    'package.json',
    '*.ts',
    '*.tsx',
    '*.mts',
    '*.cts',
    '*.js',
    '*.jsx',
    '*.mjs',
    '*.cjs',
  ],
  tools: [
    'pnpm',
    'npm',
    'yarn',
    'npx',
    'bun',
    'tsc',
    'eslint',
    'vitest',
    'jest',
    'prettier',
  ],
  configGlobs: [
    'vitest.config.?*',
    'vite.config.?*',
    'vitest.workspace.?*',
    'vitest.setup.?*',
    'jest.config.?*',
    'jest.setup.?*',
    'eslint.config.?*',
    '.eslintrc*',
    '.eslintignore',
    'tsconfig*.json',
    '.prettierrc*',
    '.prettierignore',
    'babel.config.?*',
    '.babelrc*',
    '.npmrc',
    '.yarnrc*',
    'pnpm-workspace.yaml',
    '.pnpmfile.cjs',
  ],
  testGlobs: ['**/__tests__/**', '**/test/**', '**/tests/**', '*.test.*', '*.spec.*'],
  testContent: [],
  declarations: [
    /^\s*(?:it|test|describe)(?:\.\w+)*(?:\([^)]*\))?\s*\(\s*(['"`])((?:(?!\1).)*)/,
  ],
  skipMarkers: [/\.(skip|only|todo)\b|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(/],
  assertions: [/\bexpect\s*\(|\bassert\b/],
  weakExpect: true,
};
