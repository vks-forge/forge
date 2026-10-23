/**
 * The server's harness compatibility service: first-sight check, pause and tool approvals.
 *
 * Why: Forge does not pin a harness version (d-0088). When the installed build is one it has
 *   not seen, it must check it before trusting it with Workers, without making the owner
 *   wait or run anything: a build this release shipped as verified is recorded at once with
 *   its tools approved; any other build is checked in the background. A check that fails
 *   pauses the harness with a plain message and runs refuse to start on it; a check that
 *   passes leaves every tool whose shape is new or changed `pending`, and policy denies a
 *   pending tool until the owner approves it. The check itself is a port (a minute of
 *   driving a real harness), so tests substitute a scripted one. One check runs at a time
 *   per harness, a second request returns the one in flight, and the outcome is written in
 *   one transaction so the version row, the tool rows and the harness status never disagree.
 *   The build is read at boot and when Settings change, but the owner can upgrade `claude`
 *   in place while Forge runs; a Worker started on the new build would be judged by the old
 *   build's approvals. So before every run starts `assertCurrent` reads the installed build
 *   again (the read is a cached `--version`, one spawn per file state), and a build that
 *   differs from the loaded one starts the first-sight check of the new build in the
 *   background and refuses this start with `HarnessChangedError`; the ticket parks until the
 *   owner has approved the new build's tools. The same refusal (`HarnessToolsPendingError`)
 *   covers a loaded build whose check is still running or that has a tool left `pending`:
 *   no run starts to be denied on every call, the ticket parks as a setup problem for the
 *   owner and resumes when the tools are decided. Tools whose shape an earlier build already
 *   had decided are carried over by the check, so an update that touched nothing parks nothing.
 *
 * Exports: createHarnessCompat().
 * Depends on: @forge/core (HarnessChangedError), @forge/drivers (findKnownGood), services/compat-record, services/pending-tools,
 *   services/harness-source, types/harness-compat. IO: storage; the
 *   injected check spawns the harness.
 */

import { HarnessChangedError } from '@forge/core';
import type { HarnessToolSchema } from '@forge/core';
import { findKnownGood } from '@forge/drivers';
import type { CompatJobState } from '@forge/drivers';
import { nativeNames, recordReport } from '#/services/compat-record.js';
import { assertToolsDecided } from '#/services/pending-tools.js';
import { readHarnessSetup } from '#/services/harness-source.js';
import type { HarnessCompat, HarnessCompatDeps } from '#/types/harness-compat.types.js';

const KIND = 'claude';
const RELEASE = 'forge-release';
const IDLE: CompatJobState = { state: 'idle' };

export function createHarnessCompat(deps: HarnessCompatDeps): HarnessCompat {
  const { storage, port } = deps;
  const builds = new Map<string, string | null>();
  const jobs = new Map<string, CompatJobState>();
  const running = new Map<string, Promise<void>>();
  const iso = (): string => new Date(deps.now()).toISOString();

  async function run(harnessId: string, version: string | null): Promise<void> {
    if (!port) {
      return;
    }

    const started = iso();
    jobs.set(harnessId, {
      state: 'running',
      ...(version === null ? {} : { version }),
      started_at: started,
    });

    try {
      const setup = await readHarnessSetup(storage, harnessId);
      const names = await nativeNames(deps.catalogue, deps.supportKey);
      let report = await port.check(setup, names);
      if (!report.passed) {
        // A busy machine can make a healthy build miss a hook deadline; a pause is only
        // worth causing if the failure is repeatable.
        report = await port.check(setup, names);
      }

      builds.set(harnessId, report.version);
      await recordReport(storage, harnessId, report);
      jobs.set(harnessId, {
        state: 'done',
        version: report.version,
        started_at: started,
        finished_at: iso(),
        report,
      });

      deps.log('info', 'harness compatibility check finished', {
        harness: harnessId,
        version: report.version,
        passed: report.passed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jobs.set(harnessId, {
        state: 'failed',
        ...(version === null ? {} : { version }),
        started_at: started,
        finished_at: iso(),
        error: message,
      });

      deps.log('warn', 'harness compatibility check could not run', {
        harness: harnessId,
        error: message,
      });
    }
  }

  async function start(harnessId: string): Promise<CompatJobState> {
    const live = running.get(harnessId);
    if (live) {
      return jobs.get(harnessId) ?? IDLE;
    }

    const job = run(harnessId, builds.get(harnessId) ?? null).finally(() => {
      running.delete(harnessId);
    });

    running.set(harnessId, job);

    return jobs.get(harnessId) ?? IDLE;
  }

  /** The shipped record for an ACP build: compatible now, its tools approved by the release. */
  async function recordKnownGood(harnessId: string, version: string): Promise<boolean> {
    const known = port?.engine === 'acp' ? findKnownGood(version) : undefined;
    if (!known) {
      return false;
    }

    await storage.transaction(async (tx) => {
      await tx.harnessVersions.upsert({
        kind: KIND,
        version,
        compat: 'pass',
        checked_at: iso(),
      });

      for (const [tool, schema_hash] of Object.entries(known.tools)) {
        // An owner's earlier decision on the build is never overwritten by the shipped list.
        if (!(await tx.harnessToolSchemas.get(KIND, version, tool))) {
          await tx.harnessToolSchemas.upsert({
            harness_kind: KIND,
            version,
            tool,
            schema_hash,
            status: 'approved',
            decided_by: RELEASE,
            decided_at: iso(),
          });
        }
      }
    });

    return true;
  }

  const service: HarnessCompat = {
    installedVersion: (harnessId) => builds.get(harnessId) ?? null,

    async assertCurrent(harnessId) {
      if (!port) {
        return null;
      }

      const loaded = builds.get(harnessId) ?? null;
      let installed: string | null = null;
      try {
        installed = await port.installedVersion(
          await readHarnessSetup(storage, harnessId),
        );
      } catch (error) {
        // Not readable now: the driver's own lookup fails the run with the install pointer.
        deps.log('info', 'no installed harness build could be read', {
          harness: harnessId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (installed === null || installed === loaded) {
        await assertToolsDecided(storage, KIND, loaded);

        return loaded;
      }

      deps.log(
        'warn',
        'the installed harness build changed since its approvals were loaded',
        {
          harness: harnessId,
          loaded,
          installed,
        },
      );

      await service.observe(harnessId);

      throw new HarnessChangedError(loaded, installed);
    },

    async observe(harnessId) {
      if (!port) {
        return null;
      }

      let version: string | null = null;
      try {
        version = await port.installedVersion(await readHarnessSetup(storage, harnessId));
      } catch (error) {
        deps.log('info', 'no installed harness build could be read', {
          harness: harnessId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      builds.set(harnessId, version);
      if (version === null) {
        return null;
      }

      const seen = await storage.transaction((tx) =>
        tx.harnessVersions.get(KIND, version),
      );

      if (seen === null && !(await recordKnownGood(harnessId, version))) {
        await storage.transaction((tx) =>
          tx.harnessVersions.upsert({ kind: KIND, version, compat: 'pending' }),
        );

        await start(harnessId);
      } else if (seen?.compat === 'pending' && !running.has(harnessId)) {
        await start(harnessId);
      }

      return version;
    },

    start,

    async view(harnessId) {
      const version = builds.get(harnessId) ?? null;
      const row =
        version === null
          ? null
          : await storage.transaction((tx) => tx.harnessVersions.get(KIND, version));

      return {
        version,
        compat: row?.compat ?? 'unknown',
        report: row?.report ?? null,
        checked_at: row?.checked_at ?? null,
        job: jobs.get(harnessId) ?? IDLE,
      };
    },

    async tools(harnessId) {
      const version = builds.get(harnessId) ?? null;

      return {
        version,
        tools:
          version === null
            ? []
            : await storage.transaction((tx) =>
                tx.harnessToolSchemas.list(KIND, version),
              ),
      };
    },

    async decide(harnessId, tool, decision, by) {
      const version = builds.get(harnessId) ?? null;
      if (version === null) {
        return null;
      }

      return storage.transaction(async (tx): Promise<HarnessToolSchema | null> => {
        const row = await tx.harnessToolSchemas.get(KIND, version, tool);
        if (!row) {
          return null;
        }

        const decided: HarnessToolSchema = {
          ...row,
          status: decision,
          decided_by: by.author,
          decided_at: iso(),
          decision_reason: by.reason,
        };

        await tx.harnessToolSchemas.upsert(decided);

        return decided;
      });
    },

    async idle() {
      await Promise.all([...running.values()]);
    },
  };

  return service;
}
