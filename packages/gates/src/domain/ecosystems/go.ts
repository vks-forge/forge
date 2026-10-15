/**
 * Go gate rules.
 *
 * Why: Go tests live in `*_test.go` beside the code and are silenced with `t.Skip`;
 *   lint behaviour comes from `.golangci.yml`. A Worker that skips a test or turns off
 *   a linter would make `go test` and `golangci-lint` pass without proving the change.
 *   `go.mod` is deliberately not guarded: adding a dependency is ordinary work.
 *
 * Exports: GO_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const GO_RULES: EcosystemRules = {
  id: 'go',
  detect: ['go.mod', 'go.sum', 'go.work', '*.go'],
  tools: ['go', 'gofmt', 'golangci-lint', 'staticcheck'],
  configGlobs: ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'],
  testGlobs: ['*_test.go'],
  testContent: [],
  declarations: [/^func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/],
  skipMarkers: [/\b[tb]\.Skip(?:f|Now)?\s*\(/],
  assertions: [
    /\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b|\b(?:assert|require)\./,
  ],
};
