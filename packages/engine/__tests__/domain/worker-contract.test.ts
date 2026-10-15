/**
 * Pins the rules every Worker prompt carries about its shell and about `finish`.
 *
 * Why: these lines are the only way a Worker learns facts the harness does not tell it:
 * its cwd is already the worktree, compound shell lines are denied unattended, the
 * gates match `ran_tests` against one exact command, and `finish` needs an `edited`
 * claim for every file. Losing one costs a whole run (probe 8), so a wording change that
 * drops a rule must fail here.
 *
 * Pins: workerContract() and renderWorkerContract().
 * Depends on: domain/worker-contract, vitest. No IO.
 */

import type { ProjectCheck } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { renderWorkerContract, workerContract } from '#/domain/worker-contract.js';

const npmTest: ProjectCheck[] = [{ name: 'test', role: 'test', command: 'npm test' }];

describe('workerContract', () => {
  it('names the project test command exactly, or says there is none', () => {
    const withCmd = workerContract({ rework: false, checks: npmTest });
    const without = workerContract({ rework: false });

    expect(withCmd.shell_rules.join(' ')).toContain('exactly `npm test`');
    expect(without.shell_rules.join(' ')).toContain('no test command');
    expect(without.shell_rules.join(' ')).not.toContain('exactly');
  });

  it('lists every check by role, with its cwd, and every test command', () => {
    const checks: ProjectCheck[] = [
      { name: 'lint', role: 'lint', command: 'ruff check .' },
      { name: 'unit', role: 'test', command: 'pytest -q' },
      { name: 'integration', role: 'test', command: 'pytest tests/it' },
      { name: 'types', role: 'typecheck', command: 'mypy src' },
      { name: 'web-build', role: 'build', command: 'npm run build', cwd: 'web' },
      { name: 'licenses', role: 'custom', command: 'scripts/licenses.sh' },
    ];

    const text = workerContract({ rework: false, checks }).shell_rules.join('\n');

    expect(text).toContain('one of these exact commands');
    expect(text).toContain('`pytest -q`, `pytest tests/it`');
    expect(text).toContain('Lint: `ruff check .`');
    expect(text).toContain('Typecheck: `mypy src`');
    expect(text).toContain('Build: `npm run build` (the gates run it in `web`)');
    expect(text).toContain('Check (licenses): `scripts/licenses.sh`');
  });

  it('tells the Worker not to cd, to run one command per call and to claim every edit', () => {
    const c = workerContract({ rework: false, checks: npmTest });
    const text = [...c.shell_rules, ...c.finish_rules].join('\n');

    expect(text).toContain('Never `cd`');
    expect(text).toMatch(/one shell command per call/i);
    expect(text).toContain('`;`, `&&`');
    expect(text).toContain('"kind":"edited"');
    expect(text).toContain('"kind":"ran_tests"');
    expect(text).toContain('call `finish` again');
  });

  it('adds the rework note only after a failed gate, and says earlier edits still count', () => {
    expect(workerContract({ rework: false }).rework_note).toBeUndefined();
    const note = workerContract({ rework: true }).rework_note ?? '';

    expect(note).toContain('rejected by the verification gates');
    expect(note).toContain('earlier runs');
  });

  it('renders every rule into the prompt section', () => {
    const c = workerContract({ rework: true, checks: npmTest });
    const out = renderWorkerContract(c);

    for (const line of [...c.shell_rules, ...c.finish_rules, c.rework_note ?? '']) {
      expect(out).toContain(line);
    }
  });
});
