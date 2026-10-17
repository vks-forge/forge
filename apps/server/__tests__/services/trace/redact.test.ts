/**
 * Redaction of trace entries.
 *
 * Why: the trace keeps full content (prompts, tool inputs, HTTP bodies), so the one pass that
 *   runs before anything is written is what keeps the install token, run tokens, GitHub
 *   tokens, keys and session cookies out of a file the owner may paste into an issue
 *   (d-0163). It must catch a secret by where it sits (a key named `token` or an
 *   `Authorization` header), by what it looks like (`ghp_`, `sk-`, PEM blocks) and by value
 *   (the install token, SecretStore values), at any depth, and it must never throw or leave
 *   cyclic or exotic values that would crash the writer.
 *
 * Pins: key-based, pattern-based and value-based removal, a secret learned from a secret key
 *   removed elsewhere, usage-style `*_tokens` numbers kept, non-JSON values made plain, cycles
 *   and deep nesting survive, and a property test that plants secrets at random depth.
 * Depends on: src/services/trace/redact, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRedactor } from '#/services/trace/redact.js';

const INSTALL = 'Zq9-installTOKENvalue_0123456789abcdefghijklmn';
const GHP = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';

const entry = (data: unknown, message = 'm') => ({
  ts: 't',
  seq: 1,
  level: 'info',
  kind: 'http',
  actor: 'server',
  message,
  data,
});

const run = (data: unknown, secrets: string[] = [INSTALL], message?: string) =>
  JSON.stringify(createRedactor().redact(entry(data, message) as never, secrets));

describe('redact: by key', () => {
  it('removes Authorization, cookie, token, secret, password and key fields', () => {
    const out = run({
      headers: {
        Authorization: 'Bearer abc.def.ghi',
        cookie: 'forge_session=xyz',
        Accept: 'json',
      },
      FORGE_RUN_TOKEN: 'run-token-value-1',
      client_secret: 'shh-shh-shh',
      password: 'hunter2hunter2',
      api_key: 'plain-key-value',
    });

    for (const gone of [
      'abc.def.ghi',
      'xyz',
      'run-token-value-1',
      'shh-shh-shh',
      'hunter2',
      'plain-key',
    ]) {
      expect(out).not.toContain(gone);
    }

    expect(out).toContain('json');
  });

  it('keeps token counters', () => {
    const out = run({ usage: { input_tokens: 120, output_tokens: 40 }, tokens: 5 });

    expect(out).toContain('120');
    expect(out).toContain('"tokens":5');
  });
});

describe('redact: by pattern', () => {
  it.each([
    ['github token', GHP],
    ['oauth token', 'gho_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['fine grained', 'github_pat_11ABCDEFG0abcdefghijklmnop_qrstuvwxyz'],
    ['openai style key', 'sk-ant-api03-abcdefghijklmnop'],
    ['bearer header text', 'Bearer abcdefghijklmnopqrstuv'],
    ['session cookie text', 'forge_session=abcDEF123_-xyz'],
  ])('removes a %s inside free text', (_name, secret) => {
    const out = run({ text: `before ${secret} after` }, []);

    expect(out).not.toContain(secret.split('=').at(-1) as string);
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('removes a whole PEM block', () => {
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\ndefGHI\n-----END RSA PRIVATE KEY-----';

    const out = run({ log: `key:\n${pem}\ndone` }, []);

    expect(out).not.toContain('MIIEabc');
    expect(out).not.toContain('defGHI');
    expect(out).toContain('done');
  });

  it('removes secrets in the message line too', () => {
    expect(run({}, [], `pushed with ${GHP}`)).not.toContain(GHP);
  });
});

describe('redact: by value', () => {
  it('removes known secret values anywhere, including inside longer strings and keys', () => {
    const out = run({ url: `http://x/?t=${INSTALL}&y=1`, [`k-${INSTALL}`]: 1 });

    expect(out).not.toContain(INSTALL);
  });

  it('ignores values too short to be a secret', () => {
    expect(run({ a: 'abc def' }, ['abc'])).toContain('abc def');
  });

  it('learns a value seen under a secret key and removes it from other fields', () => {
    const redactor = createRedactor();
    const out = JSON.stringify(
      redactor.redact(
        entry({
          env: { FORGE_RUN_TOKEN: 'learned-run-token-77' },
          cmd: 'tool --t learned-run-token-77',
        }) as never,
        [],
      ),
    );

    expect(out).not.toContain('learned-run-token-77');
    const later = JSON.stringify(
      redactor.redact(entry({ later: 'seen learned-run-token-77 again' }) as never, []),
    );

    expect(later).not.toContain('learned-run-token-77');
  });
});

describe('redact: robustness', () => {
  it('makes errors, bigint, maps, buffers and dates plain JSON', () => {
    const out = run({
      e: new Error('boom'),
      n: 10n,
      m: new Map([['a', 1]]),
      b: Buffer.from('hi'),
      d: new Date(0),
      u: undefined,
      f: () => 1,
    });

    expect(out).toContain('boom');
    expect(out).toContain('1970-01-01');
  });

  it('survives a cycle and very deep nesting', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a['self'] = a;
    let deep: unknown = 'leaf';
    for (let i = 0; i < 200; i++) {
      deep = { next: deep };
    }

    expect(() => run({ a, deep })).not.toThrow();
  });

  it('property: a planted secret never survives at any depth or position', () => {
    const secrets = [GHP, INSTALL, 'Bearer abcdefghijklmnopqrstuv'];
    const leaf = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null));
    const tree = fc.letrec((self) => ({
      node: fc.oneof(
        { depthSize: 'small' },
        leaf,
        fc.array(self('node'), { maxLength: 3 }),
        fc.dictionary(fc.string({ maxLength: 6 }), self('node'), { maxKeys: 3 }),
      ),
    })).node;

    fc.assert(
      fc.property(
        tree,
        fc.constantFrom(...secrets),
        fc.constantFrom('text', 'token', 'x'),
        fc.nat(2),
        (rest, secret, key, wrap) => {
          const planted =
            wrap === 0
              ? { [key]: `pre ${secret} post`, rest }
              : wrap === 1
                ? [rest, { deeper: { [key]: secret } }]
                : { rest, list: [`${secret}`, { [key]: [secret] }] };

          const out = run(planted);

          expect(out).not.toContain(GHP);
          expect(out).not.toContain(INSTALL);
          expect(out).not.toContain('abcdefghijklmnopqrstuv');
        },
      ),
      { numRuns: 200 },
    );
  });
});
