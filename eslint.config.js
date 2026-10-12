/**
 * ESLint flat config — layer rules, local `forge` plugin and the file-header check.
 *
 * Why: code.md rules 1 (layers point inward), 10 (no `../` imports) and 12 (every file
 *   opens with a header, d-0041) must fail the build, not rely on review; the two local
 *   rules live inline so no new dependency is needed (code.md rule 11).
 *
 * Exports: default export (flat config array).
 * Depends on: typescript-eslint. No IO.
 */

import tseslint from 'typescript-eslint';

const forgeImports = (allowed) => ({
  patterns: [
    {
      group:
        allowed.length > 0 ? ['@forge/*', ...allowed.map((a) => `!${a}`)] : ['@forge/*'],
      message:
        allowed.length > 0
          ? 'Adapter packages may import only @forge/core (code.md rule 1).'
          : 'packages/core may not import any other @forge package (code.md rule 1).',
    },
  ],
});

const HEADER_REQUIRED = ['Why:', 'Depends on:'];

/** Local rule: every source file opens with a rule-12 header block comment (code.md rule 12). */
const fileHeader = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      missing:
        'File must begin with a /** ... */ header containing "Why:", "Exports:" (or "Pins:" in tests) and "Depends on:" (code.md rule 12).',
    },
  },
  create(context) {
    return {
      Program(node) {
        const source = context.sourceCode;
        const first = source.getAllComments()[0];
        const text = source.getText();
        const startsWithComment =
          first !== undefined &&
          first.type === 'Block' &&
          first.value.startsWith('*') &&
          text.slice(0, first.range[0]).trim() === '';
        const required = HEADER_REQUIRED;
        const hasExports =
          startsWithComment &&
          (first.value.includes('Exports:') || first.value.includes('Pins:'));
        const ok =
          startsWithComment &&
          hasExports &&
          required.every((k) => first.value.includes(k));
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
    const check = (node) => {
      const src = node.source;
      if (src && typeof src.value === 'string' && /(^|\/)\.\.\//.test(src.value)) {
        context.report({ node: src, messageId: 'parent', data: { path: src.value } });
      }
    };
    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportExpression(node) {
        check({ source: node.source });
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
    },
  },
  create(context) {
    const file = context.filename.split(String.fromCharCode(92)).join('/');
    if (!/\/(packages|apps)\/[^/]+\/src\//.test(file)) return {};
    const inTypes = /\/src\/types\//.test(file);
    const inSchemas = /\/src\/schemas\//.test(file);
    const isZInfer = (n) =>
      n.typeAnnotation?.type === 'TSTypeReference' &&
      n.typeAnnotation.typeName.type === 'TSQualifiedName' &&
      n.typeAnnotation.typeName.left.name === 'z' &&
      n.typeAnnotation.typeName.right.name === 'infer';
    if (inTypes) {
      const runtime = (node) => context.report({ node, messageId: 'runtime' });
      return {
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
    const file = context.filename.split(String.fromCharCode(92)).join('/');
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
    files: ['packages/**/*.ts', 'apps/**/*.ts', '*.ts', '*.js'],
    plugins: { forge },
    rules: { 'forge/file-header': 'error' },
  },
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    plugins: { forge },
    rules: {
      'forge/no-parent-imports': 'error',
      'forge/types-in-types-folder': 'error',
      'forge/types-file-suffix': 'error',
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', forgeImports([])] },
  },
  {
    files: [
      'packages/db/**/*.ts',
      'packages/drivers/**/*.ts',
      'packages/gates/**/*.ts',
      'packages/memory/**/*.ts',
      'packages/tools/**/*.ts',
    ],
    rules: { 'no-restricted-imports': ['error', forgeImports(['@forge/core'])] },
  },
);
