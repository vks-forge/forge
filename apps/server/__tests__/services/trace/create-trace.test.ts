/**
 * Trace composition: off means off, on writes files with every known secret removed.
 *
 * Why: tracing is a debug switch (d-0163). With it off the server must not create a folder, open
 *   a writer or wrap anything, and must say so in one start-up line. With it on, the sink
 *   resolves a ticket's card from storage, and the literal secrets it removes come from where
 *   they live: the install token file, the SecretStore and the env passthrough values, so a
 *   planted token never reaches either trace file. A SecretStore that cannot be read must not
 *   stop tracing.
 *
 * Pins: disabled returns the no-op sink and creates nothing, start-up line for both states,
 *   enabled writes day and card files with ticket-to-card attribution, install token, store
 *   secret and passthrough value redacted, an unreadable store is tolerated, close flushes.
 * Depends on: src/services/trace/create-trace, @forge/db (memory), @forge/secrets (memory),
 *   a temp dir. IO: temp files.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CardId, Ticket } from '@forge/core';
import { NOOP_TRACE } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { createMemorySecretStore } from '@forge/secrets';
import { describe, expect, it } from 'vitest';
import { createTrace } from '#/services/trace/create-trace.js';
import { makeTempDir } from '#tests/helpers/temp.js';

const INSTALL = 'InstallTokenValue_abcdefghijklmnopqrstuvwxyz0123456789';
const T = '2026-10-16T00:00:00.000Z';

const clock = { now: () => Date.now(), after: () => () => undefined };

async function rig(enabled: boolean) {
  const root = makeTempDir('forge-trace-compose-');
  const dir = join(root, 'logs', 'trace');
  const tokenPath = join(root, 'install-token');
  writeFileSync(tokenPath, INSTALL);
  const storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.projects.upsert({
      id: 'p1',
      slug: 'dcp',
      prefix: 'FX',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    });

    await tx.tickets.insert({
      id: 'FX-1' as Ticket['id'],
      project: 'p1',
      card_id: 'FX-C1' as CardId,
      title: 't',
      body: 'b',
      type: 'feat',
      lane: 'express',
      tier_predicted: 'A',
      status: 'inbox',
      status_version: 0,
      rework_count: 0,
      priority: 0,
      created_at: T,
      updated_at: T,
      blocked_by: [],
    });
  });

  const secrets = createMemorySecretStore();
  await secrets.put(
    'github/acme/key',
    new TextEncoder().encode('STORE-SECRET-VALUE-123'),
  );

  const logs: string[] = [];
  const errs: string[] = [];
  const trace = createTrace({
    settings: { enabled, dir, keepDays: 14 },
    storage,
    secrets,
    installTokenPath: tokenPath,
    env: { PASS_ME: 'passthrough-value-xyz' },
    passthrough: ['PASS_ME'],
    clock,
    stderr: (t) => errs.push(t),
    log: (_level, message, fields) =>
      logs.push(`${message} ${JSON.stringify(fields ?? {})}`),
  });

  return { dir, trace, logs, errs, secrets };
}

describe('createTrace', () => {
  it('is the no-op sink when off, creates nothing and logs one line', async () => {
    const { dir, trace, logs } = await rig(false);
    trace.sink.emit({
      level: 'info',
      kind: 'card',
      actor: 'owner',
      message: 'x',
      data: {},
    });

    await trace.close();

    expect(trace.enabled).toBe(false);
    expect(trace.sink).toBe(NOOP_TRACE);
    expect(existsSync(dir)).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('off');
  });

  it('writes the day and card files, attributes a ticket to its card and removes secrets', async () => {
    const { dir, trace, logs } = await rig(true);

    trace.sink.emit({
      level: 'info',
      kind: 'transition',
      ticket_id: 'FX-1',
      actor: 'engine',
      message: `moved with ${INSTALL}`,
      data: {
        store: 'has STORE-SECRET-VALUE-123',
        env: 'has passthrough-value-xyz',
        gh: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
        headers: { Authorization: 'Bearer abcdefghijklmnopqrstuv' },
      },
    });

    await new Promise((r) => setTimeout(r, 30));
    await trace.close();

    const day = readdirSync(dir).find((n) => n.startsWith('forge-')) as string;
    const dayText = readFileSync(join(dir, day), 'utf8');
    const cardText = readFileSync(join(dir, 'cards', 'FX-C1.jsonl'), 'utf8');

    for (const text of [dayText, cardText]) {
      for (const secret of [
        INSTALL,
        'STORE-SECRET-VALUE-123',
        'passthrough-value-xyz',
        'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
        'abcdefghijklmnopqrstuv',
      ]) {
        expect(text).not.toContain(secret);
      }
    }

    expect(JSON.parse(cardText.trim())).toMatchObject({
      card_id: 'FX-C1',
      ticket_id: 'FX-1',
    });

    expect(logs[0]).toContain('on');
    expect(logs[0]).toContain(dir);
  });

  it('keeps tracing when the SecretStore cannot be read', async () => {
    const { dir, trace, secrets } = await rig(true);
    secrets.list = async () => {
      throw new Error('dpapi unavailable');
    };

    trace.sink.emit({
      level: 'info',
      kind: 'card',
      actor: 'owner',
      message: 'still here',
      data: {},
    });

    await new Promise((r) => setTimeout(r, 30));
    await trace.close();

    const day = readdirSync(dir).find((n) => n.startsWith('forge-')) as string;

    expect(readFileSync(join(dir, day), 'utf8')).toContain('still here');
  });
});
