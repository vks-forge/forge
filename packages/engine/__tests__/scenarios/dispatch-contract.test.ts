/**
 * Scenario: the Worker prompt carries the run rules, whatever the dispatch step wrote.
 *
 * Why: a Worker that does not know its cwd is already the worktree, that compound shell
 * lines are denied unattended, which test command the gates match, or that `finish` needs
 * an `edited` claim per file, loses whole runs to avoidable mistakes (probe 8). The rules
 * are therefore handed to the dispatch step and appended to its prompt verbatim.
 *
 * Pins: worker_contract in the step input, the appended rules section, the rework note.
 * Depends on: helpers/verify-rig, helpers/fake-git-host, vitest.
 */

import { describe, expect, it } from 'vitest';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

describe('dispatch: worker contract', () => {
  it('tells the Worker to finish with typed claims for every file it edited', async () => {
    const { rig } = await makeVerifyRig();
    await rig.request('Fix it');
    await rig.tick();

    const input = rig.llm.callsTo('dispatch_prompt')[0]?.input as {
      worker_contract: { finish_rules: string[]; rework_note?: string };
    };

    expect(input.worker_contract.finish_rules.join(' ')).toContain('`finish`');
    expect(input.worker_contract.finish_rules.join(' ')).toContain('"kind":"edited"');
    expect(input.worker_contract.rework_note).toBeUndefined();
  });

  it('tells the Worker the sandbox facts: cwd, one command per call, the exact test command', async () => {
    const { rig } = await makeVerifyRig();
    await rig.request('Fix it');
    await rig.tick();

    const input = rig.llm.callsTo('dispatch_prompt')[0]?.input as {
      worker_contract: { shell_rules: string[] };
    };

    const shell = input.worker_contract.shell_rules.join(' ');
    expect(shell).toContain('already the ticket worktree');
    expect(shell).toContain('Never `cd`');
    expect(shell).toContain('one shell command per call');
    expect(shell).toContain('`pnpm test`');
  });

  it('appends the rules to the prompt verbatim, whatever the step wrote', async () => {
    const { rig } = await makeVerifyRig();
    await rig.request('Fix it');
    await rig.tick();

    const prompt = rig.driver.starts[0]?.prompt ?? '';
    expect(prompt.startsWith('Do the ticket.')).toBe(true);
    expect(prompt).toContain('## Rules of this run');
    expect(prompt).toContain('Never `cd`');
    expect(prompt).toContain('"kind":"edited"');
    expect(prompt).toContain('exactly `pnpm test`');
  });

  it('records the brief sent to the Worker as the first run event, redacted', async () => {
    const { rig } = await makeVerifyRig();
    await rig.request('Fix it');
    await rig.tick();

    const events = await rig.storage.transaction((tx) => tx.runEvents.listByRun('run-1'));
    const first = events[0];

    expect(first?.type).toBe('prompt');
    expect(first && 'text' in first ? first.text : '').toBe(rig.driver.starts[0]?.prompt);
    expect(first && 'text' in first ? first.text : '').toContain('## Rules of this run');
  });

  it('adds a rework note when the run follows a failed gate', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(verdict('failed', [{ check: 'claims', message: 'edit not claimed' }]));
    await startAndFinish(rig);
    await rig.tick();

    const last = rig.llm.callsTo('dispatch_prompt').at(-1)?.input as {
      worker_contract: { rework_note?: string };
    };

    expect(last.worker_contract.rework_note).toContain(
      'rejected by the verification gates',
    );
  });
});
