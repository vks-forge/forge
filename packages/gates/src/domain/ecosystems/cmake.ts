/**
 * C and C++ (CMake, CTest, Make) gate rules.
 *
 * Why: native repos define their tests in CMake and CTest files and silence them with
 *   `DISABLED_` prefixes, `GTEST_SKIP()` or a `DISABLED` test property; formatting and
 *   lint come from `.clang-format` and `.clang-tidy`. A Worker that edits those makes
 *   `ctest` pass without proving the change. `CMakeLists.txt` is not guarded: it also
 *   lists source files, which is ordinary work. `Makefile` is guarded for every ecosystem.
 *
 * Exports: CMAKE_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const CMAKE_RULES: EcosystemRules = {
  id: 'cmake',
  detect: [
    'CMakeLists.txt',
    '*.cmake',
    '*.cpp',
    '*.cc',
    '*.cxx',
    '*.c',
    '*.hpp',
    '*.hh',
    '*.h',
  ],
  tools: ['cmake', 'ctest', 'make', 'ninja'],
  configGlobs: [
    'CTestTestfile.cmake',
    'CTestConfig.cmake',
    'CMakePresets.json',
    'CMakeUserPresets.json',
    '.clang-tidy',
    '.clang-format',
  ],
  testGlobs: [
    '**/test/**',
    '**/tests/**',
    '*_test.cpp',
    '*_test.cc',
    '*Test.cpp',
    'test_*.cpp',
  ],
  testContent: [],
  declarations: [
    /^\s*TEST(?:_F|_P)?\s*\(\s*\w+\s*,\s*(\w+)/,
    /^\s*TEST_CASE\s*\(\s*"([^"]*)"/,
  ],
  skipMarkers: [
    /\bDISABLED_\w+/,
    /\bGTEST_SKIP\s*\(/,
    /\bDISABLED\s+(?:TRUE|YES|ON|1)\b/i,
  ],
  assertions: [/\b(?:EXPECT|ASSERT)_\w+\s*\(|\b(?:REQUIRE|CHECK)\s*\(/],
};
