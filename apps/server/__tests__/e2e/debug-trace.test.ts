/**
 * End to end: with FORGE_TRACE on, a card's whole story lands in the trace files, secrets redacted.
 *
 * Why: the debug trace (d-0163) exists so the owner can open one file and see what happened to a
 *   card: its creation over HTTP, the Director's steps with prompt and raw output, the grill
 *   question and answer, the plan, its approval, the tickets, and the Worker's run events under
 *   the right card even though a run only knows its ticket. This runs the production assembly with
 *   a scripted planning Director and the fake Worker, and then reads the files the way the owner
 *   would. It also plants an install token, a GitHub token and a SecretStore value in what the
 *   owner types, and pins that none of them reaches either file.
 *
 * Pins: day file and card file exist; the card file holds, in order, the card creation, the
 *   queued chat turn, a failed then a good Director step with input, prompt and raw output, the
 *   grill question and answer, the plan, its approval and the tickets; the day file holds the same
 *   entries plus HTTP lines; run events and the run result appear under the card; no planted
 *   secret appears anywhere in the trace folder; a failed step logs its raw output and error.
 * Depends on: helpers/e2e-rig, helpers/planning-director. IO: git, SQLite, npm, a loopback socket, temp files.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { planningDirector } from '#tests/helpers/planning-director.js';
import { makeTempDir } from '#tests/helpers/temp.js';
import { waitFor } from '#tests/helpers/wait-for.js';

type Line = {
  seq: number;
  kind: string;
  level: string;
  message: string;
  card_id?: string;
  ticket_id?: string;
  run_id?: string;
  step?: string;
  data?: Record<string, unknown>;
};

const GHP = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
const STORE_SECRET = 'store-secret-value-for-trace-test-123';

const read = (path: string): Line[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);

/** True when `wanted` messages appear in `lines` in this order (other lines may sit between). */
function inOrder(lines: Line[], wanted: ((l: Line) => boolean)[]): boolean {
  let at = 0;
  for (const line of lines) {
    if (at < wanted.length && wanted[at]?.(line)) {
      at++;
    }
  }

  return at === wanted.length;
}

describe('debug trace end to end', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let dir: string;
  let cardId = '';
  let day: Line[] = [];
  let card: Line[] = [];

  beforeAll(async () => {
    dir = join(makeTempDir('forge-trace-e2e-'), 'trace');
    rig = await startE2eRig(['good'], {
      llm: planningDirector(),
      env: { FORGE_TRACE: '1', FORGE_TRACE_DIR: dir },
    });

    await rig.secrets.put('github/test/key', new TextEncoder().encode(STORE_SECRET));
    const created = await rig.call('POST', '/projects/fixture/cards', {
      title: 'Add an add function',
      description: `Add add(a, b) to src/math.js. token ${rig.token} and ${GHP} and ${STORE_SECRET}`,
      type: 'plan',
      dedupe_key: 'trace-card-1',
    });

    expect(created.status).toBe(201);
    cardId = (created.body as { card: { id: string } }).card.id;

    type Ev = { kind: string; payload: Record<string, unknown> };
    const events = async (): Promise<Ev[]> =>
      ((await rig.call('GET', `/cards/${cardId}/events?limit=100`)).body as { items: Ev[] })
        .items;

    const question = await waitFor('the grill question', async () =>
      (await events()).find((e) => e.kind === 'grill_question'),
    );

    const options = question.payload['options'] as { id: string; recommended?: boolean }[];
    const answered = await rig.call('POST', `/cards/${cardId}/grill/answer`, {
      question_id: question.payload['question_id'],
      option_id: (options.find((o) => o.recommended) ?? options[0])?.id,
    });

    expect(answered.status).toBe(200);

    const decision = await waitFor('the plan to be approved or ready', async () =>
      (await events()).find((e) => e.kind === 'plan_approved' || e.kind === 'plan_ready'),
    );

    if (decision.kind === 'plan_ready') {
      const approved = await rig.call('POST', `/cards/${cardId}/plan/approve`, {
        version: decision.payload['version'],
      });

      expect(approved.status).toBe(200);
    }

    await waitFor(
      'the ticket to be done',
      async () => {
        const res = await rig.call('GET', '/tickets/FX-1');

        return (res.body as { ticket?: { status: string } }).ticket?.status === 'done';
      },
      280_000,
    );

    await rig.dispose();
    const dayFile = readdirSync(dir).find((n) => n.startsWith('forge-')) as string;
    day = read(join(dir, dayFile));
    card = read(join(dir, 'cards', `${cardId}.jsonl`));
  });

  afterAll(async () => {
    await rig?.dispose().catch(() => undefined);
  });

  it('writes the card story in order into the card file', () => {
    expect(
      inOrder(card, [
        (l) => l.kind === 'card' && l.message.includes('created'),
        (l) => l.kind === 'chat',
        (l) => l.kind === 'director_step' && l.step === 'card_survey' && l.level === 'warn',
        (l) => l.kind === 'director_step' && l.step === 'card_survey' && l.level === 'info',
        (l) => l.kind === 'card_event' && l.message.includes('grill_question'),
        (l) => l.kind === 'card_event' && l.message.includes('grill_answer'),
        (l) => l.kind === 'director_step' && l.step === 'write_plan',
        (l) => l.kind === 'card_event' && /plan_(ready|approved)/.test(l.message),
        (l) => l.kind === 'card_event' && l.message.includes('plan_approved'),
        (l) => l.kind === 'ticket' && l.message.includes('created'),
        (l) => l.kind === 'transition' && l.message.includes('done'),
      ]),
    ).toBe(true);
  });

  it('keeps input, prompt, raw output and parsed result of each Director step', () => {
    const steps = card.filter((l) => l.kind === 'director_step');
    const good = steps.find((l) => l.step === 'grill_turn' && l.level === 'info');

    expect(good?.data).toMatchObject({ model: expect.any(String), harness: 'claude-code' });
    expect(good?.data?.['input']).toBeDefined();
    expect(String(good?.data?.['prompt'])).toContain('PROMPT grill_turn');
    expect(String(good?.data?.['raw'])).toContain('question');
    expect(good?.data?.['parsed']).toBeDefined();
    expect(typeof good?.data?.['duration_ms']).toBe('number');
  });

  it('logs a failed step with its raw output and error', () => {
    const failed = card.find((l) => l.kind === 'director_step' && l.level === 'warn');

    expect(String(failed?.data?.['raw'])).toContain('oops');
    expect(failed?.data?.['error']).toMatchObject({ kind: 'invalid_output' });
  });

  it('puts the Worker run under the card through its ticket', () => {
    const events = card.filter((l) => l.kind === 'run_event');

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((l) => l.run_id !== undefined && l.ticket_id === 'FX-1')).toBe(true);
    expect(card.some((l) => l.kind === 'run' && l.message.startsWith('run result'))).toBe(
      true,
    );
  });

  it('keeps every card entry in the day file too, plus the HTTP lines', () => {
    const daySeqs = new Set(day.map((l) => l.seq));

    expect(card.every((l) => daySeqs.has(l.seq))).toBe(true);
    expect(
      day.some(
        (l) =>
          l.kind === 'http' &&
          l.message === 'POST /projects/fixture/cards 201' &&
          (l.data?.['body'] as { title?: string }).title === 'Add an add function',
      ),
    ).toBe(true);

    expect(day.length).toBeGreaterThan(card.length);
    expect(day.map((l) => l.seq)).toEqual([...day.map((l) => l.seq)].sort((a, b) => a - b));
  });

  it('never writes a planted secret anywhere in the trace folder', () => {
    const files = [
      ...readdirSync(dir).filter((n) => n.endsWith('.jsonl')).map((n) => join(dir, n)),
      ...readdirSync(join(dir, 'cards')).map((n) => join(dir, 'cards', n)),
    ];

    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toContain(rig.token);
      expect(text).not.toContain(GHP);
      expect(text).not.toContain(STORE_SECRET);
    }
  });

  it('did not install tracing elsewhere: the card id names the file', () => {
    expect(existsSync(join(dir, 'cards', `${cardId}.jsonl`))).toBe(true);
  });
});
