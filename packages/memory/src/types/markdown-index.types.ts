/**
 * Markdown index types — the manifest that says whether a local index still matches its folder.
 *
 * Why: the local index of this repository's own memory is rebuilt from the markdown folder only when
 *   something changed, and "changed" must be cheap to decide: one stat per file, and a content hash only for
 *   files whose size or time moved. The manifest is that record, stored beside the index by the caller.
 *
 * Exports: ManifestEntry, MarkdownManifest, MarkdownScan.
 * Depends on: nothing. Types only.
 */

/** One record file as it was when the index was built. */
export interface ManifestEntry {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

export interface MarkdownManifest {
  readonly version: 1;
  readonly files: readonly ManifestEntry[];
}

/** The folder now, and whether it differs from the manifest it was compared with. */
export interface MarkdownScan {
  readonly manifest: MarkdownManifest;
  readonly changed: boolean;
}
