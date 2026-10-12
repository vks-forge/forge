/**
 * Pins the catalogue file reader.
 *
 * Why: the catalogue is read from a trusted path chosen by the caller. A missing file or
 * a file whose signature does not verify must leave the run with a quarantined
 * catalogue (no tools), never an empty-but-usable one.
 *
 * Pins: readCatalogueFile() for verified, tampered and missing files.
 * Depends on: adapters/catalogue-file, helpers/fixtures, node:fs, node:os, vitest.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readCatalogueFile } from '#/adapters/catalogue-file.js';
import { KEY, signedYaml } from '#tests/helpers/fixtures.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-tools-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readCatalogueFile', () => {
  it('verifies a signed file', async () => {
    const p = join(dir, 'catalog.yaml');
    await writeFile(p, signedYaml());
    expect((await readCatalogueFile(p, KEY)).status).toBe('verified');
  });

  it('quarantines a tampered file', async () => {
    const p = join(dir, 'tampered.yaml');
    await writeFile(p, signedYaml().replace('exec', 'read'));
    expect(await readCatalogueFile(p, KEY)).toEqual({
      status: 'quarantined',
      reason: 'bad_signature',
    });
  });

  it('quarantines a missing file', async () => {
    expect((await readCatalogueFile(join(dir, 'nope.yaml'), KEY)).status).toBe(
      'quarantined',
    );
  });
});
