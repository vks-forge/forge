/**
 * Development signing key for the committed tool catalogue.
 *
 * Why: the catalogue must be signed for the policy engine to trust it, but a fresh
 *   checkout has no operator key. A well-known dev key lets tests and local runs load
 *   the committed file. It is public, so a catalogue signed with it proves nothing;
 *   production runs must set `FORGE_CATALOGUE_KEY` and re-sign.
 *
 * Exports: DEV_CATALOGUE_KEY.
 * Depends on: No IO.
 */

/** INSECURE: public development key. Never use for a catalogue you rely on. */
export const DEV_CATALOGUE_KEY = 'forge-dev-catalogue-key-INSECURE';
