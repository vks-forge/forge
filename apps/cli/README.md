# @forge/cli

The `forge` command-line client. Today it has one command, `forge secret wrap`; the rest of the planned commands are not built.

## Why it exists

Some setup must happen before the server can run, and must not travel through it. The GitHub App private key is the example: it arrives as a plaintext `.pem` the user downloaded, and the server reads it only from the DPAPI-protected secret store (d-0062). Something has to move it there, run by the user, in a terminal. The CLI is also the future terminal door for filing work and answering a Worker (`forge new`, `forge doctor`, `forge run`, `forge answer` from `docs/design/m0-brief.md`, none built). The app holds no policy: the logic is in `src/services/` over ports, `src/main.ts` only composes.

## What it does

- `forge secret wrap <name> <file>`: reads `<file>`, stores its bytes as secret `<name>` in `<dataHome>/secrets/<name>.dpapi` (Windows DPAPI, current user; the data home is `%LOCALAPPDATA%\Forge` by default), reads it back and compares the bytes, then prints that the plaintext file is still on disk and the exact PowerShell command to delete it (`Remove-Item -LiteralPath '<path>'`). It never deletes, moves or rewrites your file. Names are lowercase letters, digits and dashes.
- `forge --help` (or no arguments) prints usage.
- Exit codes: 0 success, 2 usage error (unknown command or bad secret name), 1 any other failure. Errors print as one line, no stack trace.
- The data home is the same folder the server uses, from any working directory: `FORGE_HOME` (development and tests only), else the folder named in `forge-home.json` in the platform config directory, else `%LOCALAPPDATA%\Forge` (macOS `~/Library/Application Support/Forge`, Linux `$XDG_DATA_HOME/forge` or `~/.local/share/forge`). The CLI no longer looks for a `.forge` directory.
- Public API: none; it is an app. The `forge` bin entry points at `dist/main.js`.

Layout: `src/main.ts` (composition), `src/services/` (`parse-args`, `secret-wrap`, `run-cli`, `data-home`), `src/types/`.

## Why this approach

- `node:util` `parseArgs` in strict mode: no CLI framework dependency (code.md rule 11), and a typo is a usage error rather than a different command.
- The wrap command verifies by reading back and leaves deletion to the user: removing the only copy of a key is their decision, and a store that silently wrote garbage must not be discovered at the first push.
- Ports (`SecretStore`, file reader, output sinks) are injected so the whole command line is tested against `createMemorySecretStore` and a temp file; only `main.ts` touches DPAPI, the disk and the process.
- The data home rule is a pure function in `@forge/core` (`resolveDataHome`), shared with the server; the CLI only adds the one file read (`services/data-home.ts`, a twin of the server's, because apps never import each other, d-0098).
- Dependencies: `@forge/core` (schemas, typed errors, data-home rule), `@forge/secrets` (the stores).

## Requirements

- Node 24.20 and pnpm; Windows for `secret wrap` (DPAPI). Run `pnpm build` first; the `forge` bin is `dist/main.js`.
- No repository needed. Environment: `FORGE_HOME` (optional, dev/test only; an absolute folder that replaces the data home). Files: `forge-home.json` in the platform config directory, read if present.
- Tests: `pnpm test` or `npx vitest run apps/cli`. They use a temp file and the in-memory store, so they run on any OS.

## Extending

Add a command by extending `Command` in `src/types/cli.types.ts`, parsing it in `services/parse-args.ts`, and writing a service file over injected ports; dispatch it in `services/run-cli.ts`. Commands that talk to the server should call its HTTP API and parse responses with `@forge/core` schemas.

## Limits

- Only `forge secret wrap` exists; `forge new`, `doctor`, `run` and `answer` are not implemented and the server's HTTP API does not exist yet.
- `secret wrap` works only on Windows, and does not delete the plaintext for you by design.
- No `secret list` or `secret delete`; the SecretStore port has only `get` and `put`.
