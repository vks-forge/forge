/**
 * Built-in catalogue entries for the tools the Forge MCP server exposes.
 *
 * Why: the catalogue is database data, and a fresh database has to start with the tools
 *   the factory itself ships. This is that built-in content, version 1 of the catalogue
 *   (d-0085); after that the owner edits the catalogue in Settings and the database is the
 *   only source. The same entries are mirrored in `.forge/tools/catalog.yaml` for reading,
 *   and a test pins the two equal so they cannot drift.
 *
 * Exports: FORGE_SEED.
 * Depends on: nothing. No IO.
 */

export const FORGE_SEED: readonly Record<string, unknown>[] = [
  {
    id: 'mcp__forge__get_ticket',
    kind: 'factory-core',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    schema_hash:
      'sha256:af8b696c68738b8d43df0027a45c18d4431adeda8618fb440d51caa13b5389d4',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
  },
  {
    id: 'mcp__forge__add_comment',
    kind: 'factory-core',
    version: '1',
    risk: 'write-cwd',
    exposure: 'direct',
    resources: ['forge-state'],
    schema_hash:
      'sha256:ee7bc1b985ec9630dcacae9733b849e727a0bd52a04e3f42778480cd66953865',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
  },
  {
    id: 'mcp__forge__ask_director',
    kind: 'factory-core',
    version: '1',
    risk: 'write-cwd',
    exposure: 'direct',
    resources: ['forge-state'],
    schema_hash:
      'sha256:c1de6a40741a424dd58b4cabd936ae622f0398d9db575b58c060799493997fa5',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
  },
  {
    id: 'mcp__forge__report_blocked',
    kind: 'factory-core',
    version: '1',
    risk: 'write-cwd',
    exposure: 'direct',
    resources: ['forge-state'],
    schema_hash:
      'sha256:f5d24bbb5285bd9c7a11a490b29384240c8816e201e5632505199a733139d2b3',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
  },
  {
    id: 'mcp__forge__finish',
    kind: 'factory-core',
    version: '1',
    risk: 'write-cwd',
    exposure: 'direct',
    resources: ['forge-state'],
    schema_hash:
      'sha256:2be4e2817fc6afebbd77123013bed3815cd1919b727af0c14cdc0b3cc3150a12',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
  },
  {
    id: 'mcp__forge__docs_lookup',
    kind: 'factory-capability',
    version: '1',
    risk: 'read',
    exposure: 'direct',
    schema_hash:
      'sha256:838f81116a594c3aba93b38a587ae61eb73be1113ffd795151e5dff0b115ba3d',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
  },
  {
    id: 'mcp__forge__web_search',
    kind: 'factory-capability',
    version: '1',
    risk: 'network',
    exposure: 'deferred',
    cost_class: 'metered',
    taints: true,
    schema_hash:
      'sha256:01dcd0a60e3b3e9ee8aa2159d4d51cdcb948557b6b25be5ee99f31f22560cc13',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
    denies_native: ['claude-code:WebSearch'],
  },
  {
    id: 'mcp__forge__web_fetch',
    kind: 'factory-capability',
    version: '1',
    risk: 'network',
    exposure: 'deferred',
    taints: true,
    schema_hash:
      'sha256:3717dff418293d7121dfbca3c9fbdb04f659f6a54a1fa9d2c5eedf4ab06c1944',
    support: {
      '*': {
        mechanism: 'mcp',
        enforced: 'server',
      },
    },
    denies_native: ['claude-code:WebFetch'],
  },
];
