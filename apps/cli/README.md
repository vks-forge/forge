# @forge/cli

The `forge` command-line client: runs Forge in the background (`forge start | status | stop | open`) and encrypts secrets (`forge secret wrap`); the rest of the planned commands are not built.

## Why it exists

Some setup must happen before the server can run, and must not travel through it. The GitHub App private key is the example: it arrives as a plaintext `.pem` the user downloaded, and the server reads it only from the DPAPI-protected secret store (d-0062). Something has to move it there, run by the user, in a terminal. `forge start` is how a person keeps Forge running after the terminal closes: without it the server is a foreground `node` process that dies with its window. The CLI is also the future terminal door for filing work and answering a Worker (`forge new`, `forge doctor`, `forge run`, `forge answer` from `docs/design/m0-brief.md`, none built). The app holds no policy: the logic is in `src/services/` over ports, `src/main.ts` only composes.

## What it does

- `forge start`: if `<dataHome>/server.json` names a live process whose port answers `GET /health` as Forge (`{service:'forge'}`), prints its URL and exits 0 without spawning. Otherwise spawns the built server (`apps/server/dist/main.js`, or `FORGE_SERVER_ENTRY`) detached (`detached`, `windowsHide`, stdout and stderr appended to `<dataHome>/logs/server.log`), waits up to 60 s (a cold start takes about 22 s on a loaded machine) until the new process has written `server.json` and answers `/health`, printing a progress line every 5 s and looking once more at the deadline before it reports failure, and prints `Forge is running at http://127.0.0.1:<port> (pid N)` and the log path. It then opens the browser on a one-time sign-in link (`--no-open` skips that; a browser that cannot launch only prints a warning). The same happens when a server is already running. If the process dies while starting (port taken, bad config, another server holds the lock) it prints the last lines the server wrote during this start and exits 1; there is no automatic port change (the port is `FORGE_PORT`, default 4310). A recorded process that is alive but silent is reported and not started over.
- `forge open [--no-open]`: needs a running server; reads the install token from the data home, asks `POST /auth/open-code` for a code and prints `http://127.0.0.1:<port>/auth/open?code=...` (valid once, for one minute) and opens it in the default browser (`rundll32`/`open`/`xdg-open`, no shell). The token is never printed and never put in the URL. Before the token is sent, the CLI sends a random nonce to `POST /auth/proof` and requires `HMAC-SHA256(token, nonce)` back (compared in constant time); on a mismatch it refuses with `something else is answering on port N; Forge is not running there`.
- `forge status`: running or not, with url, pid, uptime and version from `server.json` and `/health`. Exit 0 running, 3 not running (also for a stale record or a silent process, which it describes).
- `forge stop`: sends `POST /admin/shutdown` with the install token to the recorded port (only when that port answered `/health` as Forge and proved it holds the token, below) and waits up to 35 s for the process to end; exit 0 when it ended or nothing was running, 1 when the token is refused, the server drops the request or is still alive after the wait (it is never killed).
- API calls from the CLI read the install token from `<dataHome>/install-token`, the user-only file the server created on its first start; it is never printed.
- `forge secret wrap <name> <file>`: reads `<file>`, stores its bytes as secret `<name>` in `<dataHome>/secrets/<name>.dpapi` (Windows DPAPI, current user; the data home is `%LOCALAPPDATA%\Forge` by default), reads it back and compares the bytes, then prints that the plaintext file is still on disk and the exact PowerShell command to delete it (`Remove-Item -LiteralPath '<path>'`). It never deletes, moves or rewrites your file. Names are lowercase letters, digits and dashes.
- `forge --help` (or no arguments) prints usage.
- Exit codes: 0 success, 2 usage error (unknown command or bad secret name), 3 `status` found no running server, 1 any other failure. Errors print as one line, no stack trace.
- The data home is the same folder the server uses, from any working directory: `FORGE_HOME` (development and tests only), else the folder named in `forge-home.json` in the platform config directory, else `%LOCALAPPDATA%\Forge` (macOS `~/Library/Application Support/Forge`, Linux `$XDG_DATA_HOME/forge` or `~/.local/share/forge`). The CLI no longer looks for a `.forge` directory.
- Public API: none; it is an app. The `forge` bin entry points at `dist/main.js`.

Layout: `src/main.ts` (composition), `src/services/` (`parse-args`, `memory-{command,dir,format,index-open}`, `secret-wrap`, `run-cli`, `data-home`, `node-daemon-ports`, `daemon/{find-server,start-server,server-status,stop-server,install-token}`), `src/types/`.

- `forge memory search <words...> [--kind decision,rejected] [--status active] [--tag t] [-k 8] [--json] [--all] [--dir <folder>]`, `forge memory get <id...> [--full] [--json]`, `forge memory related <id> [--json]`: read this repository's own markdown memory through a local index. The folder is the first `.forge/memory` found walking up from the current folder, else `FORGE_ROOT` (`--dir` names one outright). The index is a SQLite file in `<folder>/.index/` (git-ignored) built by the product's own code (`@forge/memory`, `@forge/db`: same parser, same index), rebuilt aside and swapped in by rename whenever a record changed (one stat per file against `.index/files.json`, a hash only where size or time moved), rebuilt from the markdown after a deletion or damage, and reused otherwise. It never needs the server and writes nothing outside `.index/`. Output is one line per hit (`d-0012 decision/active  statement  [why]`), `get` prints provenance first (author, origin, source, imported-with-fields-filled) and the body last (cut at 4,000 characters unless `--full`); no hits is exit 0, an unknown id is exit 1. The command loads the database package only when it runs (`import()` in `main.ts`), so `forge start | open | status | stop` are unaffected.

## Why this approach

- `node:util` `parseArgs` in strict mode: no CLI framework dependency (code.md rule 11), and a typo is a usage error rather than a different command.
- The wrap command verifies by reading back and leaves deletion to the user: removing the only copy of a key is their decision, and a store that silently wrote garbage must not be discovered at the first push.
- Ports (`SecretStore`, file reader, output sinks) are injected so the whole command line is tested against `createMemorySecretStore` and a temp file; only `main.ts` touches DPAPI, the disk and the process.
- The data home rule is a pure function in `@forge/core` (`resolveDataHome`), shared with the server; the CLI only adds the one file read (`services/data-home.ts`, a twin of the server's, because apps never import each other, d-0098).
- Dependencies: `@forge/core` (schemas, typed errors, data-home rule), `@forge/secrets` (the stores).

- The daemon commands take one port bag (`DaemonPorts`: data-home files, loopback HTTP, process table, spawn, clock) so "the server never answers for 25 s" is a unit test with a fake clock; `node-daemon-ports` is the real machine and is tested against a real detached child (`__tests__/helpers/fake-server.ts`).
- The CLI starts the server's built entry as a program and never imports server code (apps do not import each other). A server counts as running only when the recorded pid exists and the recorded port answers `/health` as Forge: a pid alone lies after reuse, a file alone after a crash, and the install token is never sent to a port that did not answer as Forge and prove it knows the token (`/health` is open, so an impostor on a recycled port could copy its answer; an HMAC of a fresh nonce it cannot forge without the token).
- Detached with a log file, not piped: a closed terminal would break pipes and kill the server on its next write. `windowsHide` keeps a console window from appearing.

## Requirements

- Node 24.20 and pnpm; Windows for `secret wrap` (DPAPI). Run `pnpm build` first (the CLI and the server); the `forge` bin is `dist/main.js`. Run `forge start` from the Forge checkout (or set `FORGE_ROOT`): the server still reads project memory from `<FORGE_ROOT>/.forge`.
- No repository needed. Environment: `FORGE_HOME` (optional, dev/test only; an absolute folder that replaces the data home), `FORGE_SERVER_ENTRY` (optional; another server entry to spawn), and everything the server reads (`FORGE_PORT`, `FORGE_ROOT`, ...) is passed on to it. Files: `forge-home.json` in the platform config directory, read if present; in the data home `server.json`, `install-token` and `logs/server.log`.
- Tests: `pnpm test` or `npx vitest run apps/cli`. Most use a temp file, the in-memory store and a scripted machine, so they run on any OS; `node-daemon-ports.test.ts` (heavy project) spawns a real detached child.

## Extending

Add a command by extending `Command` in `src/types/cli.types.ts`, parsing it in `services/parse-args.ts`, and writing a service file over injected ports; dispatch it in `services/run-cli.ts`. Commands that talk to the server should call its HTTP API and parse responses with `@forge/core` schemas.

## Limits

- `forge new`, `doctor`, `run` and `answer` are not implemented. A link printed on a shared terminal is a credential for one minute; no start on login and no tray (d-0092); `forge start` does not pass options, set `FORGE_PORT` and friends in the environment. A second terminal's `forge start` racing the first can briefly spawn two processes; the server's lock lets only one live and the loser's log says so.
- `secret wrap` works only on Windows, and does not delete the plaintext for you by design.
- No `secret list` or `secret delete`; the SecretStore port has only `get` and `put`.
