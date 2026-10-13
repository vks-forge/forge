/**
 * ESLint flat config — layer rules, local `forge` plugin and the file-header check.
 *
 * Why: layering and import discipline only hold if the build fails when they break. Core
 *   imports no sibling package, `tools` (the pure policy ring) imports core only, adapter
 *   packages (db, drivers, hooks, mcp, gates, memory) import core and tools but never each
 *   other, and only `apps/*` compose freely (d-0052). `../` imports are banned. Static
 *   and dynamic imports are both checked, so `import('@forge/x')` or `require` cannot
 *   smuggle in a forbidden edge. The same config rejects a file with no header comment,
 *   so every file explains its purpose to the next developer or agent, and keeps
 *   hand-written types in `types/`. The local rules are defined inline so the toolchain
 *   needs no extra dependency.
 *
 * Exports: default export (flat config array).
 * Depends on: typescript-eslint. No IO.
 */

import tseslint from 'typescript-eslint';

const EXT = '{ts,mts,cts,tsx,js,mjs,cjs}';

const forgeImports = (allowed) => ({
  patterns: [
    {
      group:
        allowed.length > 0 ? ['@forge/*', ...allowed.map((a) => `!${a}`)] : ['@forge/*'],
      message:
        allowed.length > 0
          ? `Only ${allowed.join(' and ')} may be imported here (d-0052).`
          : 'packages/core may not import any other @forge package (d-0052).',
    },
  ],
});

/** Layer map (d-0052): which `@forge/*` packages each package's source may load. */
const CORE_AND_TOOLS = ['@forge/core', '@forge/tools'];
const LAYER_ALLOWED = {
  core: [],
  tools: ['@forge/core'],
  db: CORE_AND_TOOLS,
  drivers: CORE_AND_TOOLS,
  gates: CORE_AND_TOOLS,
  hooks: CORE_AND_TOOLS,
  mcp: CORE_AND_TOOLS,
  memory: CORE_AND_TOOLS,
};

const HEADER_REQUIRED = ['Why:', 'Depends on:'];

const normalize = (filename) => filename.split(String.fromCharCode(92)).join('/');

/** Static text of a specifier node, or null when it has any substitution or is not a string. */
const staticText = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? '';
  return null;
};

/** Leading static text of a specifier (template literals with substitutions included). */
const staticPrefix = (node) => {
  if (node?.type === 'TemplateLiteral') return node.quasis[0]?.value.cooked ?? '';
  return staticText(node);
};

/** First argument of `require(x)` / `createRequire(...)(x)`, null if absent, undefined if not such a call. */
const requireArg = (node) => {
  const c = node.callee;
  const isRequire = c.type === 'Identifier' && c.name === 'require';
  const isCreated =
    c.type === 'CallExpression' &&
    c.callee.type === 'Identifier' &&
    c.callee.name === 'createRequire';
  return isRequire || isCreated ? (node.arguments[0] ?? null) : undefined;
};

/** Local rule: every source file opens with a rule-12 header block comment (code.md rule 12). */
const fileHeader = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      missing:
        'File must begin with a /** ... */ header containing "Why:", "Exports:" ("Pins:" in tests) and "Depends on:" (code.md rule 12).',
    },
  },
  create(context) {
    return {
      Program(node) {
        const source = context.sourceCode;
        // A leading shebang (bin scripts) is not part of the header.
        const first = source.getAllComments().find((c) => c.type !== 'Shebang');
        const text = source.getText().replace(/^#!.*/, (m) => ' '.repeat(m.length));
        const startsWithComment =
          first !== undefined &&
          first.type === 'Block' &&
          first.value.startsWith('*') &&
          text.slice(0, first.range[0]).trim() === '';
        // Test files pin behaviour (`Pins:`); every other file, helpers and contracts
        // included, declares what it exports.
        const isTest = /\.test\.[cm]?[jt]sx?$/.test(normalize(context.filename));
        const marker = isTest ? 'Pins:' : 'Exports:';
        const ok =
          startsWithComment &&
          first.value.includes(marker) &&
          HEADER_REQUIRED.every((k) => first.value.includes(k));
        if (!ok)
          context.report({ node, loc: { line: 1, column: 0 }, messageId: 'missing' });
      },
    };
  },
};

/** Local rule: no `../` imports; use `#/` inside a package, `@forge/<name>` across (code.md rule 10). */
const noParentImports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      parent:
        "Import '{{path}}' climbs with '../'. Use the package alias '#/...' or '@forge/<name>' (code.md rule 10).",
    },
  },
  create(context) {
    const climbs = (value) => /(^|\/)\.\.(\/|$)/.test(value);
    const check = (specifier) => {
      const value = staticPrefix(specifier);
      if (value !== null && climbs(value))
        context.report({ node: specifier, messageId: 'parent', data: { path: value } });
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference')
          check(node.moduleReference.expression);
      },
      CallExpression(node) {
        const arg = requireArg(node);
        if (arg) check(arg);
      },
    };
  },
};

/**
 * Local rule: dynamic imports and `require` calls obey the same layer map as static
 * imports (d-0052), and dynamic import sources in package source must be literals so the
 * layer check can see them. Apps compose freely and are exempt.
 */
const noDynamicCrossPackage = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      layer:
        "'{{name}}' may not be loaded from packages/{{pkg}} (d-0052: core imports nothing, tools imports core, adapters import core and tools).",
      dynamic:
        'Dynamic import source in package source must be a string literal so layers can be checked (d-0052).',
    },
  },
  create(context) {
    const match = /\/packages\/([^/]+)\/src\//.exec(normalize(context.filename));
    if (!match) return {};
    const pkg = match[1];
    const allowed = LAYER_ALLOWED[pkg];
    if (!allowed) return {};
    const checkName = (spec, node) => {
      const name = /^@forge\/[^/]+/.exec(staticText(spec) ?? '')?.[0];
      if (name && name !== `@forge/${pkg}` && !allowed.includes(name))
        context.report({ node, messageId: 'layer', data: { name, pkg } });
    };
    return {
      ImportExpression(node) {
        if (staticText(node.source) === null)
          context.report({ node: node.source, messageId: 'dynamic' });
        else checkName(node.source, node.source);
      },
      CallExpression(node) {
        const arg = requireArg(node);
        if (arg) checkName(arg, arg);
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference')
          checkName(node.moduleReference.expression, node);
      },
    };
  },
};

/**
 * Local rule: hand-written types live in `src/types/`; `src/schemas/` may only declare
 * `type X = z.infer<...>`; `src/types/` exports no runtime values (code.md rule 10).
 */
const typesInTypesFolder = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      misplaced:
        'Declare types in src/types/ (schemas/ may only declare `type X = z.infer<typeof X>`) (code.md rule 10).',
      runtime:
        'src/types/ files may export only types and interfaces, no runtime values (code.md rule 10).',
      reexport:
        'src/types/ files may not `export * from`; use `export type * from` or named type exports (code.md rule 10).',
      enum: 'enum is a runtime value; use a zod enum in schemas/ or a string-literal union in types/ (code.md rule 10).',
      ambient:
        '`declare module` / `declare global` is not allowed in package source (code.md rule 10).',
    },
  },
  create(context) {
    const file = normalize(context.filename);
    if (!/\/(packages|apps)\/[^/]+\/src\//.test(file)) return {};
    const inTypes = /\/src\/types\//.test(file);
    const inSchemas = /\/src\/schemas\//.test(file);
    const isZInfer = (n) =>
      n.typeAnnotation?.type === 'TSTypeReference' &&
      n.typeAnnotation.typeName.type === 'TSQualifiedName' &&
      n.typeAnnotation.typeName.left.name === 'z' &&
      n.typeAnnotation.typeName.right.name === 'infer';
    const shared = {
      TSEnumDeclaration: (node) => context.report({ node, messageId: 'enum' }),
      TSModuleDeclaration(node) {
        if (node.kind !== 'namespace') context.report({ node, messageId: 'ambient' });
      },
    };
    if (inTypes) {
      const runtime = (node) => context.report({ node, messageId: 'runtime' });
      return {
        ...shared,
        ExportAllDeclaration(node) {
          if (node.exportKind !== 'type') context.report({ node, messageId: 'reexport' });
        },
        ExportDefaultDeclaration: runtime,
        ExportNamedDeclaration(node) {
          const d = node.declaration;
          if (d) {
            if (
              [
                'VariableDeclaration',
                'FunctionDeclaration',
                'ClassDeclaration',
                'TSEnumDeclaration',
              ].includes(d.type)
            )
              runtime(node);
          } else if (
            node.exportKind !== 'type' &&
            node.specifiers.some((sp) => sp.exportKind !== 'type')
          ) {
            runtime(node);
          }
        },
      };
    }
    return {
      ...shared,
      TSInterfaceDeclaration: (node) => context.report({ node, messageId: 'misplaced' }),
      TSTypeAliasDeclaration(node) {
        if (inSchemas && isZInfer(node)) return;
        context.report({ node, messageId: 'misplaced' });
      },
    };
  },
};

/** Local rule: files under `src/types/` end in `.types.ts`, and nothing else does (code.md rule 10). */
const typesFileSuffix = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      missing: 'Files under src/types/ must be named <name>.types.ts (code.md rule 10).',
      stray:
        'The .types.ts suffix is reserved for files under src/types/ (code.md rule 10).',
    },
  },
  create(context) {
    const file = normalize(context.filename);
    if (!/\/(packages|apps)\/[^/]+\/src\//.test(file)) return {};
    const inTypes = /\/src\/types\//.test(file);
    const suffixed = file.endsWith('.types.ts');
    return {
      Program(node) {
        if (inTypes && !suffixed)
          context.report({ node, loc: { line: 1, column: 0 }, messageId: 'missing' });
        if (!inTypes && suffixed)
          context.report({ node, loc: { line: 1, column: 0 }, messageId: 'stray' });
      },
    };
  },
};

const forge = {
  rules: {
    'file-header': fileHeader,
    'no-parent-imports': noParentImports,
    'no-dynamic-cross-package': noDynamicCrossPackage,
    'types-in-types-folder': typesInTypesFolder,
    'types-file-suffix': typesFileSuffix,
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'research/**',
      'graft/**',
      '.hyperresearch/**',
      '.forge/**',
      '.worktrees/**',
      'docs/**',
      '.claude/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: [
      `packages/**/*.${EXT}`,
      `apps/**/*.${EXT}`,
      `scripts/**/*.${EXT}`,
      `*.${EXT}`,
    ],
    plugins: { forge },
    rules: { 'forge/file-header': 'error' },
  },
  {
    files: [`packages/**/*.${EXT}`, `apps/**/*.${EXT}`, `scripts/**/*.${EXT}`],
    plugins: { forge },
    rules: {
      'forge/no-parent-imports': 'error',
      'forge/no-dynamic-cross-package': 'error',
      'forge/types-in-types-folder': 'error',
      'forge/types-file-suffix': 'error',
    },
  },
  {
    // Plain-node entry points the harness executes before any build: they load compiled
    // output from `../dist`, so only the header is required of them.
    files: ['packages/*/bin/*.{js,mjs,cjs}'],
    rules: { 'forge/no-parent-imports': 'off' },
  },
  {
    files: [`packages/core/**/*.${EXT}`],
    rules: { 'no-restricted-imports': ['error', forgeImports([])] },
  },
  {
    // Policy ring: pure, imports core only. Source only; tests may use sibling fakes.
    files: [`packages/tools/src/**/*.${EXT}`],
    rules: { 'no-restricted-imports': ['error', forgeImports(['@forge/core'])] },
  },
  {
    // Adapters import core and tools, never each other (d-0052). Source only:
    // __tests__ may import a sibling adapter as a devDependency fake.
    files: ['db', 'drivers', 'gates', 'hooks', 'mcp', 'memory'].map(
      (p) => `packages/${p}/src/**/*.${EXT}`,
    ),
    rules: {
      'no-restricted-imports': ['error', forgeImports(['@forge/core', '@forge/tools'])],
    },
  },
);
