/**
 * Shapes of the composed server: external ports, registries, the server handle.
 *
 * Why: `apps/server` is composition only. What it cannot build itself (the Worker driver,
 *   which needs the run preparation this app owns, and the Director's model) comes in as a
 *   port, so the same assembly runs the real Claude adapters in production and fakes in the
 *   end-to-end test. The handle it returns is the small surface `main.ts`, tests and the
 *   shutdown path use.
 *
 * Exports: ToolPolicy, ToolPolicyDeps, GateDeps, ShutdownParts, HarnessWiring, DriverFactoryDeps,
 *   LlmWiring, LlmFactory, HarnessTester, ExternalPorts, AssembleOptions, ServerAddress, ForgeServer, Ticker.
 * Depends on: @forge/core, @forge/drivers (types), @forge/engine (types), @forge/hooks (types),
 *   @forge/tools (types). Types only.
 */

import type {
  Clock,
  ConfigSource,
  DirectorLLM,
  Run,
  RunRequest,
  SecretStore,
  StorageAdapter,
  TriggerAdapter,
  WorkerDriver,
  WorktreeManager,
} from '@forge/core';
import type {
  DirectorStepTrace,
  HarnessSetup,
  HarnessSource,
  HarnessTestResult,
  PreparedRun,
  ReceiptLookup,
} from '@forge/drivers';
import type { Engine, IdSource, Logger } from '@forge/engine';
import type { RunSecretRegistry } from '@forge/hooks';
import type { AdmitContext, CatalogueStore, ReceiptLog } from '@forge/tools';
import type { RestrictFile } from '#/types/auth.types.js';
import type { Drain } from '#/types/drain.types.js';
import type { CompatPort, HarnessCompat } from '#/types/harness-compat.types.js';
import type { ProjectRegistry } from '#/types/project-registry.types.js';

/** The effective tool catalogue and the per-run admission context built from it. */
export interface ToolPolicy {
  /** SHA-256 of the effective catalogue (stored on every run row); throws when it does not load. */
  readonly catalogueHash: () => Promise<string>;
  readonly admitContext: (run: Run) => Promise<AdmitContext>;
  /** Whether a healthy catalogue lists `tool`; a setup escalation for an unknown or quarantined tool resumes once it does. */
  readonly toolCatalogued: (tool: string) => Promise<boolean>;
}

/** What the tool policy reads: the catalogue, the approvals of the installed build, project grants. */
export interface ToolPolicyDeps {
  readonly storage: StorageAdapter;
  readonly catalogue: CatalogueStore;
  readonly config: ConfigSource;
  readonly compat: HarnessCompat;
  readonly dataHome: string;
}

/**
 * Where a run finds its harness settings and credentials. Read per run from the database
 * and the SecretStore, so an edit in Settings applies to the next run with no restart.
 */
export interface HarnessWiring {
  readonly harness: HarnessSource;
  readonly secrets: SecretStore;
}

/** What the driver factory is given to build a WorkerDriver for this server. */
export interface DriverFactoryDeps extends HarnessWiring {
  /** Creates the run directory, registers the token and secret (and the resume link for a resumed run), returns the MCP entry and hook URL. */
  readonly prepareRun: (req: RunRequest) => Promise<PreparedRun>;
  /** Read access to the receipt chain the hook route writes. */
  readonly receipts: ReceiptLookup;
  readonly log: Logger;
}

/** What the Director's model is built from: the harness settings, and where to report prompts and raw output when the debug trace is on (d-0163). */
export interface LlmWiring extends HarnessWiring {
  readonly onTrace?: (trace: DirectorStepTrace) => void;
}

/** Builds the Director's model once the harness settings source exists. */
export type LlmFactory = (wiring: LlmWiring) => DirectorLLM;

/** The "Test environment" check behind `POST /harnesses/:id/test`; `live` allows the one paid call. */
export type HarnessTester = (
  setup: HarnessSetup,
  live: boolean,
  secrets: SecretStore,
) => Promise<HarnessTestResult>;

/** The parts the app does not build: real Claude adapters in `main`, fakes in tests. */
export interface ExternalPorts {
  readonly driver: (deps: DriverFactoryDeps) => WorkerDriver;
  /** The model itself (fakes), or a factory when it needs the harness settings (the Claude adapter). */
  readonly llm: DirectorLLM | LlmFactory;
  /** Absent means harness testing reports itself unavailable. */
  readonly harnessTest?: HarnessTester;
  /** The harness compatibility check; absent means no build is ever checked or known. */
  readonly compat?: CompatPort;
  readonly secrets?: SecretStore;
  /** Ticket sources besides chat (which is always on); each must pass the TriggerAdapter contract. */
  readonly triggers?: readonly TriggerAdapter[];
  /** How often polled sources are asked; defaults to a minute. */
  readonly triggerPollMs?: number;
  readonly clock?: Clock;
  readonly ids?: IdSource;
  readonly log?: Logger;
  /** Narrows a file to the current user; absent means icacls on Windows, chmod elsewhere (tests pass a fake). */
  readonly restrictFile?: RestrictFile;
  /**
   * Folder of the built web UI to serve at `/`. Absent means look next to this app
   * (`apps/web/dist/web`); `null` means serve no UI (tests).
   */
  readonly webRoot?: string | null;
  /** Releases what these ports hold; called once at the end of shutdown. */
  readonly dispose?: () => Promise<void> | void;
}

/** What the process that hosts the server decides about its lifecycle. */
export interface AssembleOptions {
  /**
   * Called by `POST /admin/shutdown`; the host runs its normal signal path (shutdown, then
   * exit). Absent means the route just stops the server.
   */
  readonly onShutdownRequested?: () => void;
}

export interface ServerAddress {
  readonly host: string;
  readonly port: number;
  readonly url: string;
}

/** Coalesces "tick now" requests and runs the periodic tick. */
export interface Ticker {
  /** Starts the interval and asks for an immediate first tick (the restart reconcile). */
  start(): void;
  /** Runs one tick soon; many calls before it starts become one. */
  requestTick(): void;
  /** Stops the interval and waits for a tick in flight. */
  stop(): Promise<void>;
}

export interface ForgeServer {
  /** This instance's owner id; runs owned by another id are resumed or crash-settled at the first tick. */
  readonly owner: string;
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  readonly engine: Engine;
  readonly runSecrets: RunSecretRegistry;
  /** The projects being served. */
  readonly projects: ProjectRegistry;
  /** Per-build harness compatibility: checks, pauses and tool approvals. */
  readonly compat: HarnessCompat;
  /** The versioned tool catalogue. */
  readonly catalogue: CatalogueStore;
  /** Opens the port and starts the tick; resolves with the bound address. */
  start(): Promise<ServerAddress>;
  /** Graceful shutdown; safe to call more than once. */
  stop(): Promise<void>;
  address(): ServerAddress | null;
}

/** What the G1 gate is built from. */
export interface GateDeps {
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  readonly worktrees: WorktreeManager;
  readonly registry: RunSecretRegistry;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** What the shutdown sequence stops, in order. */
export interface ShutdownParts {
  readonly ticker: Ticker;
  /** Stops the polling of polled ticket sources; absent in tests that have none. */
  readonly stopPolling?: () => Promise<void> | void;
  readonly engine: Engine;
  /** Marks one live run interrupted for the next start to resume, and stops its harness. */
  readonly interruptRun: (runId: string) => Promise<void>;
  readonly storage: StorageAdapter;
  /** Ends open event streams so the port can close. */
  readonly endStreams: () => void;
  readonly closeHttp: () => Promise<void>;
  /** Releases what the external ports hold (temp directories); runs after the port closes. */
  readonly disposePorts?: (() => Promise<void> | void) | undefined;
  /** Stops admitting tool calls and waits for in-flight ones before runs are interrupted; absent in tests that have none. */
  readonly drain?: Drain;
  /** The configured drain wait in ms (`engine.shutdown_drain_ms`), read when the stop begins. */
  readonly drainMs?: () => Promise<number>;
  readonly graceMs: number;
  readonly log: Logger;
  /** Sleep between gate-job polls; injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}
