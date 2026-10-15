/**
 * .NET (C#, F#) gate rules.
 *
 * Why: .NET tests sit in `*Tests` projects and are silenced with `[Ignore]` or
 *   `Skip = "..."`; analyzer strictness comes from `.editorconfig`, `Directory.Build.props`
 *   and `*.runsettings`. A Worker that edits those makes `dotnet test` pass without
 *   proving the change.
 *
 * Exports: DOTNET_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const DOTNET_RULES: EcosystemRules = {
  id: 'dotnet',
  detect: ['*.csproj', '*.fsproj', '*.vbproj', '*.sln', '*.slnx', '*.cs', '*.fs'],
  tools: ['dotnet', 'msbuild', 'nuget'],
  configGlobs: [
    'Directory.Build.props',
    'Directory.Build.targets',
    'Directory.Packages.props',
    '.editorconfig',
    '*.runsettings',
    '*.ruleset',
    'global.json',
    'stylecop.json',
    'nuget.config',
  ],
  testGlobs: ['**/*Tests/**', '**/*.Tests/**', '*Tests.cs', '*Test.cs', '*Tests.fs'],
  testContent: [],
  declarations: [/^\s*(?:public\s+)?(?:async\s+)?(?:Task|void)\s+(\w+)\s*\(/],
  skipMarkers: [/\[(?:Ignore|Explicit)\b/, /\bSkip\s*=/],
  assertions: [/\bAssert\.|\.Should\(\)|\bAssert\w*\s*\(/],
};
