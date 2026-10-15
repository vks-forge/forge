/**
 * Python gate rules.
 *
 * Why: on a Python repo the suite is steered by `pyproject.toml`, `pytest.ini`, `tox.ini`
 *   and `conftest.py`, and a test is silenced with `@pytest.mark.skip`, `xfail` or
 *   `unittest.skip`. A Worker that edits those makes `pytest` pass while proving nothing,
 *   so G1 treats them as gate configuration and as test weakening.
 *
 * Exports: PYTHON_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const PYTHON_RULES: EcosystemRules = {
  id: 'python',
  detect: ['*.py', 'requirements*.txt', 'Pipfile', 'poetry.lock', 'uv.lock'],
  tools: [
    'pytest',
    'ruff',
    'mypy',
    'uv',
    'tox',
    'nox',
    'flake8',
    'black',
    'pip',
    'poetry',
  ],
  configGlobs: [
    'pyproject.toml',
    'setup.cfg',
    'tox.ini',
    'pytest.ini',
    'conftest.py',
    'mypy.ini',
    'ruff.toml',
    '.ruff.toml',
    '.flake8',
    '.coveragerc',
    'noxfile.py',
  ],
  testGlobs: ['test_*.py', '*_test.py', '**/tests/**', '**/test/**'],
  testContent: [],
  declarations: [/^\s*(?:async\s+)?def\s+(\w+)/, /^\s*class\s+(Test\w*)/],
  skipMarkers: [
    /\.(skip|skipif|xfail)\b/,
    /\bpytest\.(skip|xfail)\s*\(/,
    /@(?:unittest\.)?skip(?:If|Unless)?\b/,
    /\bself\.skipTest\s*\(/,
    /@unittest\.expectedFailure\b/,
  ],
  assertions: [/\bassert\b|\bself\.assert\w+\s*\(|\bpytest\.raises\b/],
};
