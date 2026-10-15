/**
 * Built-in catalogue entries for harness-native tools (Read, Glob, Grep, Edit, Write, shell, Task).
 *
 * Why: the catalogue is database data, and a fresh database has to start with the tools
 *   the factory itself ships. This is that built-in content, version 1 of the catalogue
 *   (d-0085); after that the owner edits the catalogue in Settings and the database is the
 *   only source. The same entries are mirrored in `.forge/tools/catalog.yaml` for reading,
 *   and a test pins the two equal so they cannot drift.
 *
 * Exports: NATIVE_SEED.
 * Depends on: nothing. No IO.
 */

export const NATIVE_SEED: readonly Record<string, unknown>[] = [
  {
    id: 'read',
    kind: 'harness-native',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: 'Read',
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
  {
    id: 'glob',
    kind: 'harness-native',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: 'Glob',
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
  {
    id: 'grep',
    kind: 'harness-native',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: 'Grep',
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
  {
    id: 'edit',
    kind: 'harness-native',
    version: '1',
    risk: 'write-cwd',
    exposure: 'direct',
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: 'Edit',
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
  {
    id: 'write',
    kind: 'harness-native',
    version: '1',
    risk: 'write-cwd',
    exposure: 'direct',
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: 'Write',
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
  {
    id: 'shell',
    kind: 'harness-native',
    version: '1',
    risk: 'exec',
    exposure: 'direct',
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: ['Bash', 'PowerShell'],
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
  {
    id: 'task',
    kind: 'harness-native',
    version: '1',
    risk: 'exec',
    exposure: 'hidden',
    reaches_tools: ['read', 'glob', 'grep', 'edit', 'write', 'shell'],
    resources: ['cwd'],
    support: {
      'claude-code': {
        native: ['Task', 'Agent'],
        mechanism: 'allow-flag',
        enforced: 'harness',
      },
    },
  },
];
