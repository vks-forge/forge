/**
 * Shell allow-list — the shell commands a lane allows without asking, built per project.
 *
 * Why: a Worker must be able to run its project's tests, lint and type checks unattended
 *   (in the Express lane an `ask` is a denial), and that has to hold for any language
 *   (d-0095). A fixed list of `pnpm`/`pytest`/`cargo` rules leaves a Gradle or .NET project
 *   unable to run its own tests, and a list that allowed everything would let a Worker run
 *   anything. So the list is derived: the project's own check commands (each as a prefix
 *   rule, exactly as configured), plus the verify-only commands of the ecosystems the
 *   project uses, plus read-only and local `git`. Interpreters, wrappers and package
 *   launchers (`python`, `node`, `bash`, `npx`, `pnpm exec`) are never allowed this way
 *   (a command led by one is left to ask), because allowing them allows anything. The data
 *   comes in as arguments; this package reads no project settings.
 *
 * Exports: shellSafeRules(), ECOSYSTEM_SHELL_RULES, BASE_SHELL_RULES.
 * Depends on: domain/command-classes, types/shell-allowlist. No IO.
 */

import { isBannedAllowResource } from '#/domain/command-classes.js';
import type { ShellAllowInput } from '#/types/shell-allowlist.types.js';

/** Local, non-pushing git and read-only listing: allowed in every project. */
export const BASE_SHELL_RULES: readonly string[] = [
  'git status*',
  'git diff*',
  'git log*',
  'git show*',
  'git add*',
  'git commit*',
  'git branch*',
  'git switch*',
  'git restore*',
  'git stash*',
  'ls',
  'ls *',
  'pwd',
  'Get-Location',
  'Get-ChildItem*',
];

/** Verify-only commands per ecosystem: test, lint, typecheck, format check, build. No installs. */
export const ECOSYSTEM_SHELL_RULES: Readonly<Record<string, readonly string[]>> = {
  node: [
    'pnpm test*',
    'pnpm lint*',
    'pnpm typecheck*',
    'pnpm format:check*',
    'pnpm build*',
    'pnpm run test*',
    'pnpm run lint*',
    'pnpm run typecheck*',
    'pnpm run build*',
    'npm test*',
    'npm run test*',
    'npm run lint*',
    'npm run typecheck*',
    'npm run build*',
    'yarn test*',
    'yarn lint*',
    'yarn typecheck*',
    'yarn build*',
    'tsc*',
    'eslint*',
    'vitest*',
    'jest*',
    'prettier --check*',
  ],
  python: [
    'pytest*',
    'ruff check*',
    'ruff format --check*',
    'mypy*',
    'tox*',
    'nox*',
    'uv run pytest*',
    'uv run ruff*',
    'uv run mypy*',
  ],
  go: [
    'go test*',
    'go vet*',
    'go build*',
    'gofmt -l*',
    'gofmt -d*',
    'golangci-lint run*',
  ],
  rust: [
    'cargo test*',
    'cargo clippy*',
    'cargo check*',
    'cargo build*',
    'cargo fmt --check*',
    'cargo fmt -- --check*',
  ],
  jvm: [
    './gradlew test*',
    './gradlew check*',
    './gradlew build*',
    './gradlew spotlessCheck*',
    'gradle test*',
    'gradle check*',
    'gradle build*',
    'mvn test*',
    'mvn verify*',
    'mvn -q test*',
    'mvn -B test*',
    './mvnw test*',
    './mvnw verify*',
    'sbt test*',
  ],
  dotnet: ['dotnet test*', 'dotnet build*', 'dotnet format --verify-no-changes*'],
  ruby: [
    'bundle exec rspec*',
    'bundle exec rake test*',
    'bundle exec rake spec*',
    'bundle exec rubocop*',
    'rspec*',
    'rubocop*',
    'rake test*',
    'rake spec*',
  ],
  php: [
    'composer test*',
    'composer lint*',
    'composer run test*',
    'phpunit*',
    'vendor/bin/phpunit*',
    'phpcs*',
    'vendor/bin/phpcs*',
    'phpstan*',
  ],
  cmake: [
    'ctest*',
    'cmake --build*',
    'make test*',
    'make check*',
    'make lint*',
    'make build*',
    'ninja test*',
  ],
};

/** Words that identify an ecosystem when a project names none: the first word of a check command. */
const TOOL_ECOSYSTEM: Readonly<Record<string, string>> = {
  pnpm: 'node',
  npm: 'node',
  yarn: 'node',
  tsc: 'node',
  eslint: 'node',
  vitest: 'node',
  jest: 'node',
  prettier: 'node',
  pytest: 'python',
  ruff: 'python',
  mypy: 'python',
  uv: 'python',
  tox: 'python',
  nox: 'python',
  go: 'go',
  gofmt: 'go',
  'golangci-lint': 'go',
  cargo: 'rust',
  rustfmt: 'rust',
  './gradlew': 'jvm',
  gradle: 'jvm',
  mvn: 'jvm',
  './mvnw': 'jvm',
  sbt: 'jvm',
  dotnet: 'dotnet',
  bundle: 'ruby',
  rake: 'ruby',
  rspec: 'ruby',
  rubocop: 'ruby',
  composer: 'php',
  phpunit: 'php',
  phpcs: 'php',
  phpstan: 'php',
  cmake: 'cmake',
  ctest: 'cmake',
  make: 'cmake',
  ninja: 'cmake',
};

/** Shell operators and substitutions; a command with one is several commands and gets no rule. */
const COMPOUND = /[;&|<>`$()\n\r]/;

const firstWord = (command: string): string =>
  (command.trim().split(/\s+/)[0] ?? '').toLowerCase();

/** The project's own check command as a prefix rule, or null when it cannot safely be one. */
function ruleForCommand(command: string): string | null {
  const c = command.trim().replace(/\s+/g, ' ');
  if (c === '' || COMPOUND.test(c) || /[*?]/.test(c) || isBannedAllowResource(c)) {
    return null;
  }

  return `${c}*`;
}

function ecosystemsFor(input: ShellAllowInput): string[] {
  const named = input.ecosystems
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e in ECOSYSTEM_SHELL_RULES);

  if (named.length > 0) {
    return named;
  }

  const seen = input.commands.flatMap((c) => TOOL_ECOSYSTEM[firstWord(c)] ?? []);

  // Nothing says which language this is: allow every ecosystem's verify commands, as
  // before projects named their checks, rather than leave the Worker unable to test.
  return seen.length > 0 ? seen : Object.keys(ECOSYSTEM_SHELL_RULES);
}

/**
 * The `allow` shell resources for a project: `git` and listing, the verify commands of its
 * ecosystems (named, else implied by its check commands, else all), and each of its check
 * commands as a prefix rule. With no input, every ecosystem applies.
 */
export function shellSafeRules(
  input: ShellAllowInput = { commands: [], ecosystems: [] },
): string[] {
  const rules = [
    ...ecosystemsFor(input).flatMap((e) => ECOSYSTEM_SHELL_RULES[e] ?? []),
    ...input.commands.flatMap((c) => ruleForCommand(c) ?? []),
    ...BASE_SHELL_RULES,
  ];

  return [...new Set(rules)];
}
