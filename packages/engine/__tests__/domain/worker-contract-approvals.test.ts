/**
 * Pins what a Worker is told about calls that wait for the owner, and that Express is not told.
 *
 * Why: a Standard or Full Worker whose call is refused as "waiting for the owner" must not retry
 * or work around it, and after the owner answers it must be told, in fixed words, to run the call
 * or to leave it. Express has nobody to ask, so its brief must stay exactly what it was: a changed
 * Express brief changes what every Express run spends and how it behaves.
 *
 * Pins: workerContract() and renderWorkerContract() for the three lanes, renderApprovalAnswers().
 * Depends on: domain/worker-contract, domain/approval-answers, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { renderApprovalAnswers } from '#/domain/approval-answers.js';
import {
  OWNER_WAIT_RULE,
  renderWorkerContract,
  workerContract,
} from '#/domain/worker-contract.js';

describe('the owner-wait rule', () => {
  it.each(['standard', 'full'] as const)('is in the %s brief', (lane) => {
    const text = renderWorkerContract(workerContract({ rework: false, lane }));

    expect(text).toContain(OWNER_WAIT_RULE);
    expect(OWNER_WAIT_RULE).toContain('Do not retry or work around it');
    expect(OWNER_WAIT_RULE).toContain('you will be resumed with the answer');
  });

  it('is not in the Express brief, which stays what it was', () => {
    const express = workerContract({ rework: false, lane: 'express' });
    const plain = workerContract({ rework: false });

    expect(express).toEqual(plain);
    expect(renderWorkerContract(express)).not.toContain('waiting for the owner');
  });

  it('never lists answers for Express, even if given', () => {
    const contract = workerContract({
      rework: false,
      lane: 'express',
      approvals: [{ what: 'pkg add x', answer: 'allow_once' }],
    });

    expect(contract).toEqual(workerContract({ rework: false }));
  });
});

describe('approval answers', () => {
  it('words each answer in fixed sentences naming the exact call', () => {
    expect(
      renderApprovalAnswers([
        { what: 'pkg add a', answer: 'allow_once' },
        { what: 'pkg add b', answer: 'allow_always' },
        { what: 'pkg add c', answer: 'deny', note: 'use a.' },
      ]),
    ).toEqual([
      'Allowed once: `pkg add a` — run it now exactly as before.',
      'Allowed always: `pkg add b` — run it now exactly as before; the owner allowed it for this project from now on.',
      'Denied: `pkg add c` — do not attempt it or work around it; if the task cannot be done without it, call report_blocked. The owner added: use a.',
    ]);
  });

  it('puts the answers in the rendered brief of a resumed Standard run', () => {
    const text = renderWorkerContract(
      workerContract({
        rework: false,
        lane: 'standard',
        approvals: [{ what: 'pkg add a', answer: 'allow_once' }],
      }),
    );

    expect(text).toContain('The owner answered your approval requests:');
    expect(text).toContain('- Allowed once: `pkg add a`');
  });
});
