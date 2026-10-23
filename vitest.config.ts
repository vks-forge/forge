/**
 * Vitest configuration for the whole workspace.
 *
 * Why: every package's and app's tests must run from one `pnpm test` at the root with the
 *   same resolution as the build, so a green run means the whole workspace is green. It
 *   also enforces per-package line-coverage floors (70% for core and db, the state
 *   machine and storage the Director's correctness rests on; 80% for tools, mcp, hooks,
 *   drivers, engine, git, memory, research, secrets, triggers and apps/mcp, apps/cli and apps/server, the policy and adapter code) so they cannot quietly lose test
 *   coverage. Live probes (any `__tests__/probes` folder: harness, GitHub App) skip themselves
 *   unless FORGE_PROBES=1, so they never count toward or against these floors. The web app
 *   (apps/web, React components and hooks, 70%) runs in its own `web` project under jsdom,
 *   because its tests need a DOM and a JSX transform the Node projects do not.
 *   Test files that spawn git, node children, PowerShell or a whole server run in a
 *   separate `heavy` project, two at a time: on Windows every spawn costs hundreds of
 *   milliseconds, and a dozen such files running at once starved each other into hook and
 *   test timeouts and `EBUSY` on temp directories. Everything else runs in the `unit`
 *   project at full parallelism. Coverage is configured once here and covers both. Off
 *   Windows the DPAPI adapter is left out of coverage because its real-API tests only run there.
 *
 * Exports: default export (vitest config).
 * Depends on: vitest. No IO.
 */

import { defineConfig } from 'vitest/config';

/** Files whose tests spawn processes (git, node, powershell, a server): run few at a time. */
const HEAVY = [
  'packages/git/__tests__/**/*.test.ts',
  'packages/secrets/__tests__/adapters/secret-stores.contract.test.ts',
  'packages/gates/__tests__/adapters/command-runner.test.ts',
  'packages/gates/__tests__/adapters/any-language-fixtures.test.ts',
  // A real `npm ci` on a fixture project: skipped where npm is not installed.
  'packages/gates/__tests__/adapters/worktree-preparer.heavy.test.ts',
  // A node script as a fake package manager: proves a restored install skips the command.
  'packages/gates/__tests__/adapters/worktree-preparer-cache.heavy.test.ts',
  'packages/drivers/__tests__/adapters/**/*.test.ts',
  // Project memory is a real git repo per project; every write spawns several git processes.
  'packages/memory/__tests__/**/*.test.ts',
  'apps/server/__tests__/routes/memory*.test.ts',
  'apps/server/__tests__/e2e/**/*.test.ts',
  'apps/server/__tests__/routes/projects.test.ts',
  'apps/server/__tests__/routes/project-inspect.test.ts',
  'apps/server/__tests__/routes/project-detected.test.ts',
  'apps/server/__tests__/routes/projects-any-folder.test.ts',
  'apps/server/__tests__/routes/projects-archive.test.ts',
  'apps/server/__tests__/routes/project-delete.test.ts',
  'apps/server/__tests__/services/run-server.test.ts',
  'apps/server/__tests__/services/composition-parts.test.ts',
  'apps/server/__tests__/services/auth/install-token.test.ts',
  'apps/cli/__tests__/services/node-daemon-ports.test.ts',
];

const INCLUDE = ['packages/*/__tests__/**/*.test.ts', 'apps/*/__tests__/**/*.test.ts'];
const EXCLUDE = ['**/node_modules/**', '**/dist/**'];
/** The web app's tests need a browser-like DOM; they run in their own `web` project. */
const WEB_INCLUDE = ['apps/web/__tests__/**/*.test.{ts,tsx}'];

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    // Vitest's default also lists `**/package.json/**`, so any package.json edit (a script, a
    // version) reran the whole suite under `--changed`. Only config and setup files change how
    // every test runs; the web setup file is named here so it stays a trigger.
    forceRerunTriggers: [
      '**/{vitest,vite}.config.*/**',
      'apps/web/__tests__/helpers/setup.ts',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: INCLUDE,
          exclude: [...EXCLUDE, ...HEAVY, ...WEB_INCLUDE],
          // Vitest runs projects with different worker limits one group after the other, so
          // the fast files finish before the heavy ones start and never compete with them.
          sequence: { groupOrder: 1 },
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        // Vite compiles JSX itself; the app's tsconfig says `react-jsx`, so match it here.
        oxc: { jsx: { runtime: 'automatic' } },
        test: {
          name: 'web',
          include: WEB_INCLUDE,
          exclude: EXCLUDE,
          environment: 'jsdom',
          setupFiles: ['apps/web/__tests__/helpers/setup.ts'],
          sequence: { groupOrder: 1 },
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'heavy',
          include: HEAVY,
          exclude: EXCLUDE,
          // Two files at a time: enough to overlap waiting on children, few enough that
          // they do not starve one another of process spawns.
          maxWorkers: 2,
          sequence: { groupOrder: 2 },
          // Building a fixture repo is a dozen git processes and an e2e ticket runs real
          // `npm test` three times; the defaults (5 s test, 10 s hook) are for unit tests.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**/*.ts',
        'packages/db/src/**/*.ts',
        'packages/tools/src/**/*.ts',
        'packages/hooks/src/**/*.ts',
        'packages/mcp/src/**/*.ts',
        'packages/drivers/src/**/*.ts',
        'packages/engine/src/**/*.ts',
        'packages/gates/src/**/*.ts',
        'packages/git/src/**/*.ts',
        'packages/memory/src/**/*.ts',
        'packages/research/src/**/*.ts',
        'packages/secrets/src/**/*.ts',
        'packages/triggers/src/**/*.ts',
        'apps/mcp/src/**/*.ts',
        'apps/cli/src/**/*.ts',
        'apps/server/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/__tests__/**',
        '**/index.ts',
        'apps/*/src/main.ts',
        'apps/web/src/main.tsx',
        // DPAPI is Windows-only and its real-API tests skip elsewhere (see the secrets
        // contract test), so off Windows its lines would count as uncovered against the floor.
        ...(process.platform === 'win32'
          ? []
          : ['packages/secrets/src/adapters/dpapi/**']),
      ],
      thresholds: {
        'packages/core/src/**': { lines: 70 },
        'packages/db/src/**': { lines: 70 },
        'packages/tools/src/**': { lines: 80 },
        'packages/mcp/src/**': { lines: 80 },
        'packages/hooks/src/**': { lines: 80 },
        'packages/drivers/src/**': { lines: 80 },
        'packages/engine/src/**': { lines: 80 },
        'packages/gates/src/**': { lines: 80 },
        'packages/git/src/**': { lines: 80 },
        'packages/memory/src/**': { lines: 80 },
        'packages/research/src/**': { lines: 80 },
        'packages/secrets/src/**': { lines: 80 },
        'packages/triggers/src/**': { lines: 80 },
        'apps/mcp/src/**': { lines: 80 },
        'apps/cli/src/**': { lines: 80 },
        'apps/server/src/**': { lines: 80 },
        'apps/web/src/**': { lines: 70 },
      },
    },
  },
});
