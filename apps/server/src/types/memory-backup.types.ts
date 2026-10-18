/**
 * Memory backup types — what a backup is given and the manifest it leaves.
 *
 * Why: the backup taken before memory moves into the database is only worth having if it can be checked
 *   later, so it writes a manifest of every file (size and sha256), and a restore or a test reads that same
 *   shape back. The inputs are explicit paths so a test can point a backup at a temp folder.
 *
 * Exports: BackupDeps, BackupManifest.
 * Depends on: nothing. Types only.
 */

export interface BackupDeps {
  /** The live database file; a second connection takes the snapshot. */
  readonly dbPath: string;
  /** Where backups go: `<dataHome>/backups`. */
  readonly backupsDir: string;
  /** `<dataHome>/memory`: each project's repository sits in `<memoryDir>/<slug>`. */
  readonly memoryDir: string;
  /** The projects whose memory folder is copied. */
  readonly slugs: readonly string[];
  readonly now: () => Date;
}

/** What `manifest.json` holds; `path` is relative to the backup folder with forward slashes. */
export interface BackupManifest {
  readonly version: 1;
  readonly created_at: string;
  readonly files: {
    readonly path: string;
    readonly size: number;
    readonly sha256: string;
  }[];
}
