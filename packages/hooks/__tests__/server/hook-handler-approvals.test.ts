/**
 * Pins: how the hook handler turns an `ask` into a visible wait for the owner.
 *
 * Why: on Standard and Full an edit under `migrations/` is `ask`. It must not run, must not
 *   vanish, and the Worker must be told it is waiting: the handler raises one approval through
 *   the injected door, answers `ask` with the interaction id and receipts that id as
 *   `approval_ref`. If no approval can be raised the call is denied (an ask nobody knows about
 *   would wait for ever). When the owner has answered, the repeated call is allowed and the
 *   receipt names the owner. A link that resolves to a sensitive folder is asked for as the
 *   folder it really is, so an approval cannot be borrowed through a junction.
 *
 * Pins: PreToolUse ask / refusal / approved allow / physical view.
 * Depends on: helpers/fixtures, @forge/tools (approvalKey), node:fs, vitest. IO: a temp directory.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { approvalKey } from '@forge/tools';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RaiseApproval } from '#/index.js';
import { RUN_ID, TOKEN, makeEnv, preWith, testCtx } from '#tests/helpers/fixtures.js';

const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

let base: string;
let home: string;
let wt: string;

beforeAll(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'forge-appr-')));
  home = join(base, 'forge-home');
  wt = join(home, 'worktrees', 't1');
  mkdirSync(join(wt, 'migrations'), { recursive: true });
  symlinkSync(join(wt, 'migrations'), join(wt, 'alias'), LINK_TYPE);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const MIGRATION = 'migrations/001_init.sql';

async function pre(over: Parameters<typeof makeEnv>[0], file = MIGRATION, id = 'tu1') {
  const env = makeEnv({ real: { dataHome: home, cwd: wt }, ...over });
  await env.ready;
  const res = await env.handler.handle(RUN_ID, TOKEN, {
    event: 'PreToolUse',
    payload: preWith('Write', { file_path: file, content: 'x' }, id),
    seq: 1,
  });

  const chain = await env.receipts.list(RUN_ID);
  env.close();

  return { res, chain };
}

describe('PreToolUse ask', () => {
  it('raises one approval, answers ask with its id and receipts it as approval_ref', async () => {
    const raise = vi.fn<RaiseApproval>(async () => ({ interaction_id: 'int-1' }));

    const { res, chain } = await pre({ raiseApproval: raise });

    expect(raise).toHaveBeenCalledTimes(1);
    expect(raise.mock.calls[0]?.[0]).toMatchObject({
      useId: 'tu1',
      decision: { decision: 'ask' },
      call: { tool: 'write' },
    });

    expect(res).toMatchObject({
      decision: 'ask',
      reason: 'awaiting_owner',
      interaction_id: 'int-1',
    });

    expect(chain[0]).toMatchObject({
      kind: 'decision',
      decision: 'ask',
      reason: 'awaiting_owner',
      approver: 'auto',
      approval_ref: 'int-1',
    });
  });

  it.each([
    ['refuses', async () => null],
    [
      'throws',
      async () => {
        throw new Error('boom');
      },
    ],
  ])('denies as approval_unavailable when the door %s', async (_n, raise) => {
    const { res, chain } = await pre({ raiseApproval: raise });

    expect(res).toMatchObject({ decision: 'deny', reason: 'approval_unavailable' });
    expect(res.interaction_id).toBeUndefined();
    expect(chain[0]).toMatchObject({ decision: 'deny', approval_ref: null });
  });

  it('never calls the door for an allow or a deny', async () => {
    const raise = vi.fn<RaiseApproval>(async () => ({ interaction_id: 'int-x' }));

    const allowed = await pre({ raiseApproval: raise }, 'src/a.ts');

    expect(allowed.res.decision).toBe('allow');
    expect(raise).not.toHaveBeenCalled();
  });

  it('answers ask as admit() judged it when no door is wired', async () => {
    const { res } = await pre({});

    expect(res).toMatchObject({ decision: 'ask' });
    expect(res.interaction_id).toBeUndefined();
  });
});

describe('PreToolUse after the owner answered', () => {
  const key = (file: string): string | null =>
    approvalKey(testCtx(home, wt), {
      phase: 'call',
      tool: 'write',
      via: 'direct',
      native: 'Write',
      input: { file_path: file, content: 'x' },
    });

  it('allows the same call and receipts the owner as approver', async () => {
    const k = key(MIGRATION) as string;
    const raise = vi.fn<RaiseApproval>(async () => ({ interaction_id: 'int-9' }));

    const { res, chain } = await pre({
      raiseApproval: raise,
      approvals: { once: [{ key: k, ref: 'int-1' }], denied: [] },
    });

    expect(res).toMatchObject({ decision: 'allow', reason: 'approved_once' });
    expect(raise).not.toHaveBeenCalled();
    expect(chain[0]).toMatchObject({
      decision: 'allow',
      approver: 'user',
      approval_ref: 'approval:int-1',
    });
  });

  it('keeps denying a denied call without raising again', async () => {
    const k = key(MIGRATION) as string;
    const raise = vi.fn<RaiseApproval>(async () => ({ interaction_id: 'int-9' }));

    const { res } = await pre({
      raiseApproval: raise,
      approvals: { once: [], denied: [{ key: k, ref: 'int-2' }] },
    });

    expect(res).toMatchObject({ decision: 'deny', reason: 'approval_denied' });
    expect(raise).not.toHaveBeenCalled();
  });

  it('asks again for another resource', async () => {
    const k = key(MIGRATION) as string;
    const raise = vi.fn<RaiseApproval>(async () => ({ interaction_id: 'int-3' }));

    const { res } = await pre(
      {
        raiseApproval: raise,
        approvals: { once: [{ key: k, ref: 'int-1' }], denied: [] },
      },
      'migrations/002_next.sql',
    );

    expect(res).toMatchObject({ decision: 'ask', interaction_id: 'int-3' });
  });
});

describe('PreToolUse through a link', () => {
  it('asks for the folder the link resolves to, so one approval cannot cover the link', async () => {
    const raise = vi.fn<RaiseApproval>(async () => ({ interaction_id: 'int-4' }));

    const { res } = await pre({ raiseApproval: raise }, 'alias/001_init.sql');

    expect(res).toMatchObject({ decision: 'ask', interaction_id: 'int-4' });
    const file = String(raise.mock.calls[0]?.[0].call.input?.['file_path']);

    expect(file.split(sep).join('/')).toContain('migrations/001_init.sql');
    expect(file).not.toContain('alias');
  });
});
