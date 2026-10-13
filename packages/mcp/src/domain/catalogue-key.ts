/**
 * Development signing key for the committed tool catalogue.
 *
 * Why: the catalogue must be signed for the policy engine to trust it, but a fresh
 *   checkout has no operator key. A well-known dev key lets tests and local runs load
 *   the committed file. It is public, so a catalogue signed with it proves nothing: the
 *   loader in `@forge/tools` refuses it unless the caller passes `allowDevKey`, and
 *   production runs must set `FORGE_CATALOGUE_KEY` and re-sign. The constant lives in
 *   `@forge/tools` next to that check; this file only re-exports it for the signer script.
 *
 * Exports: DEV_CATALOGUE_KEY.
 * Depends on: @forge/tools. No IO.
 */

export { DEV_CATALOGUE_KEY } from '@forge/tools';
