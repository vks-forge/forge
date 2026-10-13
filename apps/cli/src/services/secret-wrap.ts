/**
 * `forge secret wrap`: encrypt an existing secret file into the SecretStore.
 *
 * Why: the GitHub App private key arrives as a plaintext `.pem` the user downloaded. The
 *   server reads it only from the DPAPI-protected store (d-0062), so something must move
 *   it there. This command stores the bytes, reads them back and compares them (a store
 *   that silently wrote garbage would otherwise be found at the first push), and then
 *   tells the user the plaintext is still on disk and how to delete it. It never deletes
 *   or touches the user's file itself: removing the only copy of a key is the user's call.
 *
 * Exports: wrapSecret(), describeWrap().
 * Depends on: node:crypto, @forge/core (CrashError, InvalidInputError, SecretName), types/cli. IO: through the injected ports only.
 */

import { timingSafeEqual } from 'node:crypto';
import { CrashError, InvalidInputError, SecretName } from '@forge/core';
import type { WrapSecretDeps, WrapSecretResult } from '#/types/cli.types.js';

/** Stores the file's bytes as secret `name`, verifies the round trip, and leaves the file alone. */
export async function wrapSecret(
  deps: WrapSecretDeps,
  name: string,
  file: string,
): Promise<WrapSecretResult> {
  // Fail on a bad name before reading the file, so a typo never touches the key.
  if (!SecretName.safeParse(name).success)
    throw new InvalidInputError(
      `invalid secret name "${name}" (lowercase letters, digits and dashes)`,
    );
  const bytes = await deps.readFile(file);
  await deps.store.put(name, bytes);
  const back = await deps.store.get(name);
  const same =
    back !== null &&
    back.length === bytes.length &&
    timingSafeEqual(Buffer.from(back), Buffer.from(bytes));
  if (!same)
    throw new CrashError(
      `secret "${name}" did not read back identical after storing; your file was not changed`,
    );
  const sourcePath = deps.resolvePath(file);
  return {
    name,
    bytes: bytes.length,
    sourcePath,
    deleteCommand: `Remove-Item -LiteralPath '${sourcePath.replaceAll("'", "''")}'`,
  };
}

/** The text shown to the user after a successful wrap. */
export function describeWrap(r: WrapSecretResult): string {
  return [
    `Stored secret "${r.name}" (${r.bytes} bytes), encrypted for your Windows account, and verified by reading it back.`,
    '',
    `The plaintext file is still on disk, untouched: ${r.sourcePath}`,
    'Once you are sure you no longer need it, delete it with:',
    `  ${r.deleteCommand}`,
    '',
  ].join('\n');
}
