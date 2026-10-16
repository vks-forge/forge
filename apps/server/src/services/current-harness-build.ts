/**
 * Which build of each harness kind is "current" for the Inbox.
 *
 * Why: Forge keeps a row per harness build it has ever seen, but only one build is run and
 *   judged by tool policy: the installed one. A tool approval or compat failure on an
 *   older build can no longer be acted on (the harness page shows only the installed
 *   build), so listing it would nag the owner forever. The current build is the installed
 *   one when the compat service knows it, else the build Forge checked most recently.
 *
 * Exports: currentHarnessBuilds(), CurrentHarnessBuilds.
 * Depends on: @forge/core (StorageTx, HarnessVersion). IO: reads storage.
 */

import type { HarnessVersion, StorageTx } from '@forge/core';

/** The current build per harness kind, with when Forge observed it. */
export class CurrentHarnessBuilds {
  constructor(
    private readonly versions: readonly HarnessVersion[],
    private readonly installed: (kind: string) => string | null,
  ) {}

  /** The current version of `kind`, or null when Forge knows no build of it. */
  version(kind: string): string | null {
    const installed = this.installed(kind);
    if (installed !== null) {
      return installed;
    }

    const newest = this.versions
      .filter((v) => v.kind === kind)
      .reduce<HarnessVersion | null>(
        (best, v) =>
          best === null || (v.checked_at ?? '') > (best.checked_at ?? '') ? v : best,
        null,
      );

    return newest?.version ?? null;
  }

  /** True when `version` is the current build of `kind`; an unknown current build matches all. */
  isCurrent(kind: string, version: string): boolean {
    const current = this.version(kind);

    return current === null || current === version;
  }

  /** When Forge checked `kind`'s `version`, if it ever did. */
  checkedAt(kind: string, version: string): string | undefined {
    return this.versions.find((v) => v.kind === kind && v.version === version)
      ?.checked_at;
  }
}

/** Reads every known build once and wraps it with the installed-build lookup. */
export async function currentHarnessBuilds(
  tx: StorageTx,
  installed: (kind: string) => string | null,
): Promise<CurrentHarnessBuilds> {
  const versions = [
    ...(await tx.harnessVersions.listByCompat('pass')),
    ...(await tx.harnessVersions.listByCompat('fail')),
    ...(await tx.harnessVersions.listByCompat('pending')),
  ];

  return new CurrentHarnessBuilds(versions, installed);
}
