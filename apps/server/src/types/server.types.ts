/**
 * Shapes of the composed server: external ports, registries, the server handle.
 *
 * Why: `apps/server` is composition only. What it cannot build itself (the Worker driver,
 *   which needs the run preparation this app owns, and the Director's model) comes in as a
 *   port, so the same assembly runs the real Claude adapters in production and fakes in the
 *   end-to-end test. The handle it returns is the small surface `main.ts`, tests and the
 *   shutdown path use.
 *
 * Exports: HarnessIdentity, ToolPolicy, GateDeps, ShutdownParts, HarnessWiring, DriverFactoryDeps,
 *   LlmFactory, HarnessTester, ExternalPorts, ServerAddress, ForgeServer, Ticker.
 * Depends on: @forge/core, @forge/drivers (types), @forge/engine (types), @forge/hooks (types),
 *   @forge/tools (types). Types only.
 */

import type {
  Clock,
  DirectorLLM,
  Run,
  RunRequest,
  SecretStore,
  StorageAdapter,
  WorkerDriver,
  WorktreeManager,
} from '@forge/core';
import type {
  HarnessSetup,
  HarnessSource,
  HarnessTestResult,
  PreparedRun,
  ReceiptLookup,
} from '@forge/drivers';
import type { Engine, IdSource, Logger } from '@forge/engine';
import type { RunSecretRegistry } from '@forge/hooks';
import type { AdmitContext, ReceiptLog } from '@forge/tools';

/** The harness the Workers run on: its driver id and the build it reports, null when unknown. */
export interface HarnessIdentity {
  readonly id: string;
  readonly version: string | null;
}

/** The verified tool catalogue and the per-run admission context built from it. */
export interface ToolPolicy {
  /** SHA-256 of the verified catalogue; stored on every run row. */
  readonly catalogueHash: string;
  readonly admitContext: (run: Run) => Promise<AdmitContext>;
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
  /** Creates the run directory, registers the token and secret, returns the MCP entry and hook URL. */
  readonly prepareRun: (req: RunRequest) => Promise<PreparedRun>;
  /** Read access to the receipt chain the hook route writes. */
  readonly receipts: ReceiptLookup;
  readonly log: Logger;
}

/** Builds the Director's model once the harness settings source exists. */
export type LlmFactory = (wiring: HarnessWiring) => DirectorLLM;

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
  readonly secrets?: SecretStore;
  readonly clock?: Clock;
  readonly ids?: IdSource;
  readonly log?: Logger;
  /** Releases what these ports hold; called once at the end of shutdown. */
  readonly dispose?: () => Promise<void> | void;
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
  /** This instance's owner id; runs owned by another id are crashed at the first tick. */
  readonly owner: string;
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  readonly engine: Engine;
  readonly runSecrets: RunSecretRegistry;
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
  readonly engine: Engine;
  readonly driver: WorkerDriver;
  readonly storage: StorageAdapter;
  /** Ends open event streams so the port can close. */
  readonly endStreams: () => void;
  readonly closeHttp: () => Promise<void>;
  /** Releases what the external ports hold (temp directories); runs after the port closes. */
  readonly disposePorts?: (() => Promise<void> | void) | undefined;
  readonly graceMs: number;
  readonly log: Logger;
  /** Sleep between gate-job polls; injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}
