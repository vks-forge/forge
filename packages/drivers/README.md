# @forge/drivers

`WorkerDriver` implementations: one folder per harness under `src/adapters/`. Depends on `@forge/core` only.
Today it holds only the Slice 2 preflight probes; the Claude driver is built on their findings.

## Public API (`src/index.ts`)

Nothing exported yet.

## Probes (`__tests__/probes/`)

Live checks against the real harness on the user's subscription (auth under settings isolation, hooks
firing/blocking inside `-p`, the ACP adapter). Skipped unless `FORGE_PROBES=1`; run with `pnpm probes`.
Results and surprises: `__tests__/probes/RESULTS.md`. Artefacts go to the gitignored `.forge/data/probes/`.

## Pinned dependencies

`@agentclientprotocol/claude-agent-acp@0.89.1`, `@agentclientprotocol/sdk@1.8.0` (exact pins).

## Adding a driver

Create `src/adapters/<harness>/`, implement the core `WorkerDriver` port, export from `src/index.ts`, and run
the driver contract test against it before adding adapter-specific tests.
