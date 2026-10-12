/**
 * Refreshes schema hashes and signs `.forge/tools/catalog.yaml`.
 *
 * Why: the tool catalogue is the root of trust for what a Worker may be offered, so it
 *   carries an HMAC signature that the loader checks before trusting any entry. After a
 *   tool's schema or declaration changes, the forge tools' `schema_hash` values must be
 *   recomputed from what the MCP server really advertises and the file re-signed, or the
 *   loader quarantines everything. This script does both in one step.
 *
 * Exports: none (script). Usage: pnpm build, then `node scripts/sign-catalogue.mjs [file]`.
 * Depends on: yaml (via packages/tools), packages/tools/dist, packages/mcp/dist. IO: rewrites the catalogue file.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(process.argv[2] ?? resolve(root, '.forge/tools/catalog.yaml'));

const toolsDist = resolve(root, 'packages/tools/dist/index.js');
const mcpDist = resolve(root, 'packages/mcp/dist/index.js');
const { signCatalogue } = await import(pathToFileURL(toolsDist).href).catch(() => {
  throw new Error('packages/tools is not built: run `pnpm build` first');
});
const { computeToolSchemaHashes, DEV_CATALOGUE_KEY } = await import(
  pathToFileURL(mcpDist).href
).catch(() => {
  throw new Error('packages/mcp is not built: run `pnpm build` first');
});
const { parseDocument } = createRequire(resolve(root, 'packages/tools/package.json'))(
  'yaml',
);

let key = process.env.FORGE_CATALOGUE_KEY;
if (!key) {
  key = DEV_CATALOGUE_KEY;
  console.warn(
    'WARNING: FORGE_CATALOGUE_KEY is not set; signing with the public, INSECURE dev key.',
  );
}

const live = await computeToolSchemaHashes();
const doc = parseDocument(readFileSync(file, 'utf8'));
const entries = doc.get('entries');
for (const entry of entries.items) {
  const id = entry.get('id');
  if (id in live) {
    entry.set('schema_hash', live[id]);
  } else if (entry.get('kind') === 'harness-native') {
    // Native tools have no MCP schema; pin the declared id and per-harness native names.
    const natives = JSON.stringify(entry.get('support').toJSON());
    entry.set(
      'schema_hash',
      `sha256:${createHash('sha256').update(`harness-native:${id}:${natives}`).digest('hex')}`,
    );
  }
}
doc.set('signature', signCatalogue(doc.get('entries').toJSON(), key));
writeFileSync(file, doc.toString({ lineWidth: 0 }));
console.log(`signed ${file} (${entries.items.length} entries)`);
