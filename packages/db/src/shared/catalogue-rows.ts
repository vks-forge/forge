/**
 * Row mapping and save validation shared by the SQLite and in-memory catalogue stores.
 *
 * Why: both stores must accept and refuse exactly the same saves and read rows back the
 *   same way, or tests on the memory store would pass against behaviour SQLite does not
 *   have. A save is refused unless the document loads as a catalogue (every entry valid,
 *   no duplicate id) and carries an author and a reason, because a stored version that
 *   cannot load would leave the server with no tools at all. A stored row that no longer
 *   parses fails loudly on read instead of reaching policy.
 *
 * Exports: toCatalogueVersion(), checkAppend().
 * Depends on: @forge/core (InvalidInputError), @forge/tools, shared/db-errors,
 *   types/storage-driver.types. No IO.
 */

import { InvalidInputError } from '@forge/core';
import { CatalogueVersion, loadCatalogue } from '@forge/tools';
import type { CatalogueAppend } from '@forge/tools';
import { parseStored } from '#/shared/db-errors.js';
import type { SqlRow } from '#/types/storage-driver.types.js';

/** A `catalogue_versions` row as a typed version. */
export function toCatalogueVersion(row: SqlRow): CatalogueVersion {
  return parseStored(
    CatalogueVersion,
    {
      version: row['version'],
      doc: JSON.parse(String(row['doc_json'])) as unknown,
      author: row['author'],
      reason: row['reason'],
      created_at: row['created_at'],
    },
    'catalogue version',
  );
}

/** Returns the request with its document parsed; throws `InvalidInputError` for an unusable save. */
export function checkAppend(input: CatalogueAppend): CatalogueAppend {
  if (input.author.trim() === '' || input.reason.trim() === '') {
    throw new InvalidInputError('a catalogue save needs an author and a reason');
  }

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new InvalidInputError('expectedVersion must be a whole number, 0 or more');
  }

  if (loadCatalogue(input.doc).status !== 'verified') {
    throw new InvalidInputError(
      'the catalogue document is not valid: every tool needs a valid entry and a unique id',
    );
  }

  return input;
}
