/**
 * Pins: `forge secret wrap` stores the file, verifies it by reading it back, prints how to
 * delete the plaintext, and never changes or removes the user's file.
 *
 * Why: this runs against the only copy of the GitHub App private key. A command that
 * deleted the file, rewrote it, or reported success without a verified round trip could
 * lose the key or leave the server with garbage; the user alone decides when to delete.
 *
 * Depends on: src/services/{secret-wrap,run-cli,parse-args}, @forge/secrets, node:fs/promises.
 */

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SecretStore } from '@forge/core';
import { createMemorySecretStore } from '@forge/secrets';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCommand } from '#/services/parse-args.js';
import { runCli } from '#/services/run-cli.js';
import { describeWrap, wrapSecret } from '#/services/secret-wrap.js';
import type { CliDeps } from '#/types/cli.types.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function keyFile(content = 'PEM-BYTES\n') {
  const dir = await mkdtemp(join(tmpdir(), "forge cli o'brien "));
  dirs.push(dir);
  const file = join(dir, 'app.pem');
  await writeFile(file, content);

  return { dir, file };
}

const readBytes = async (p: string) => new Uint8Array(await readFile(p));

function cliRig(store: SecretStore) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    openStore: async () => store,
    readFile: readBytes,
    resolvePath: resolve,
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
  };

  return { deps, out, err };
}

describe('wrapSecret', () => {
  it('stores the bytes, verifies them and leaves the source file untouched', async () => {
    const { dir, file } = await keyFile();
    const before = await stat(file);
    const store = createMemorySecretStore();

    const r = await wrapSecret(
      { store, readFile: readBytes, resolvePath: resolve },
      'github-app-key',
      file,
    );

    expect(
      Buffer.from((await store.get('github-app-key')) as Uint8Array).toString(),
    ).toBe('PEM-BYTES\n');

    expect(await readFile(file, 'utf8')).toBe('PEM-BYTES\n');
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await readdir(dir)).toEqual(['app.pem']);
    expect(r).toMatchObject({
      name: 'github-app-key',
      bytes: 10,
      sourcePath: resolve(file),
    });
  });

  it('prints a delete command that quotes the path and does not run it', async () => {
    const { file } = await keyFile();
    const r = await wrapSecret(
      { store: createMemorySecretStore(), readFile: readBytes, resolvePath: resolve },
      'k',
      file,
    );

    const text = describeWrap(r);

    expect(r.deleteCommand).toBe(
      `Remove-Item -LiteralPath '${resolve(file).replaceAll("'", "''")}'`,
    );

    expect(text).toContain('still on disk');
    expect(text).toContain(r.deleteCommand);
  });

  it('fails without claiming success when the store does not read back what it was given', async () => {
    const { file } = await keyFile();
    const lying: SecretStore = {
      put: async () => undefined,
      get: async () => Uint8Array.from([1]),
    };

    await expect(
      wrapSecret({ store: lying, readFile: readBytes, resolvePath: resolve }, 'k', file),
    ).rejects.toMatchObject({ errorFamily: 'crash' });

    expect(await readFile(file, 'utf8')).toBe('PEM-BYTES\n');
  });

  it('propagates a missing file without touching the store', async () => {
    const store = createMemorySecretStore();

    await expect(
      wrapSecret(
        { store, readFile: readBytes, resolvePath: resolve },
        'k',
        join(tmpdir(), 'forge-nope.pem'),
      ),
    ).rejects.toThrow();

    expect(await store.get('k')).toBeNull();
  });
});

describe('runCli', () => {
  it('wraps a file end to end and exits 0', async () => {
    const { file } = await keyFile();
    const store = createMemorySecretStore();
    const { deps, out, err } = cliRig(store);

    const code = await runCli(['secret', 'wrap', 'github-app-key', file], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join('')).toContain('Remove-Item');
    expect(await store.get('github-app-key')).not.toBeNull();
  });

  it('exits 2 with usage on a bad name or bad command, and 1 on a failure', async () => {
    const { file } = await keyFile();
    const store = createMemorySecretStore();
    const a = cliRig(store);
    const b = cliRig(store);
    const c = cliRig(store);

    expect(await runCli(['secret', 'wrap', '../evil', file], a.deps)).toBe(2);
    expect(await runCli(['secret', 'wipe'], b.deps)).toBe(2);
    expect(
      await runCli(['secret', 'wrap', 'k', join(tmpdir(), 'forge-nope.pem')], c.deps),
    ).toBe(1);

    expect(a.err.join('')).toContain('Usage');
    expect(c.err.join('')).toContain('forge:');
  });

  it('prints usage for --help and for no arguments', async () => {
    const a = cliRig(createMemorySecretStore());
    const b = cliRig(createMemorySecretStore());

    expect(await runCli(['--help'], a.deps)).toBe(0);
    expect(await runCli([], b.deps)).toBe(0);
    expect(a.out.join('')).toContain('forge secret wrap');
  });
});

describe('parseCommand', () => {
  it('parses wrap and rejects missing, extra and unknown arguments', () => {
    expect(parseCommand(['secret', 'wrap', 'k', 'f.pem'])).toEqual({
      kind: 'secret-wrap',
      name: 'k',
      file: 'f.pem',
    });

    expect(() => parseCommand(['secret', 'wrap', 'k'])).toThrow(/usage/);
    expect(() => parseCommand(['secret', 'wrap', 'k', 'f', 'x'])).toThrow(/usage/);
    expect(() => parseCommand(['--bogus'])).toThrow();
  });
});
