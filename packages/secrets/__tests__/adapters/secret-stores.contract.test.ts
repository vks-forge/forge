/**
 * Pins: the memory and DPAPI secret stores satisfy the SecretStore contract (DPAPI on a
 * real Windows account only), and the DPAPI store's own guarantees: the blob on disk never
 * contains the plaintext, a copy of the store directory still decrypts for the same user,
 * a tampered blob fails loudly, no temp files remain, the constructor refuses other
 * platforms, and a missing PowerShell is a typed crash.
 *
 * Why: this is where the GitHub App key rests. Plaintext on disk, a silent plaintext
 * fallback on Linux, or a half-written blob would each defeat the point of d-0062.
 *
 * Depends on: contract/secret-store.contract, src/index, node:fs/promises.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDpapiSecretStore, createMemorySecretStore } from '#/index.js';
import { describeSecretStoreContract } from '#tests/contract/secret-store.contract.js';

const dirs: string[] = [];
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'forge secrets '));
  dirs.push(dir);

  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describeSecretStoreContract('memory', async () => createMemorySecretStore());

describe('memory secret store', () => {
  it('keeps copies, so mutating bytes in or out does not change the stored secret', async () => {
    const store = createMemorySecretStore();
    const input = Uint8Array.from([1, 2, 3]);
    await store.put('k', input);
    input.fill(9);

    const out = (await store.get('k')) as Uint8Array;
    out.fill(7);

    expect(await store.get('k')).toEqual(Uint8Array.from([1, 2, 3]));
  });
});

const onWindows = process.platform === 'win32';

describe.runIf(onWindows)('dpapi secret store (real DPAPI)', { timeout: 60_000 }, () => {
  describeSecretStoreContract('dpapi', async () =>
    createDpapiSecretStore({ dir: await tempDir() }),
  );

  it('writes only ciphertext: the plaintext is not in the file, and no temp file is left', async () => {
    const dir = await tempDir();
    const store = createDpapiSecretStore({ dir });
    const secret = 'TOP-SECRET-PEM-CONTENT-0123456789';

    await store.put('github-app-key', Buffer.from(secret));

    const files = await readdir(dir);
    const blob = await readFile(join(dir, 'github-app-key.dpapi'));
    expect(files).toEqual(['github-app-key.dpapi']);
    expect(blob.includes(Buffer.from(secret))).toBe(false);
    expect(blob.toString('latin1')).not.toContain('TOP-SECRET');
  });

  it('a second store instance on the same directory reads what the first wrote', async () => {
    const dir = await tempDir();
    await createDpapiSecretStore({ dir }).put('k', Buffer.from('v'));

    const got = await createDpapiSecretStore({ dir }).get('k');

    expect(Buffer.from(got as Uint8Array).toString()).toBe('v');
  });

  it('fails with a typed crash error on a corrupted blob instead of returning garbage', async () => {
    const dir = await tempDir();
    const store = createDpapiSecretStore({ dir });
    await store.put('k', Buffer.from('v'));
    await writeFile(join(dir, 'k.dpapi'), Buffer.from('not a dpapi blob'));

    await expect(store.get('k')).rejects.toMatchObject({ errorFamily: 'crash' });
  });

  it('reports a missing PowerShell as a typed crash error', async () => {
    const store = createDpapiSecretStore({
      dir: await tempDir(),
      powershell: join(tmpdir(), 'no-such-powershell.exe'),
    });

    await expect(store.put('k', Buffer.from('v'))).rejects.toMatchObject({
      errorFamily: 'crash',
    });
  });
});

describe('dpapi secret store platform guard', () => {
  it('refuses to be constructed off Windows rather than storing plaintext', () => {
    expect(() => createDpapiSecretStore({ dir: 'x', platform: 'linux' })).toThrowError(
      expect.objectContaining({ errorFamily: 'policy_denied' }),
    );
  });
});
