# @forge/cli

A thin command-line client for the Forge server. Not implemented yet; this app has only a `package.json`.

## Why it exists

Not every interaction needs the control room. A user or script should be able to file work, check that the setup is healthy, start a run or answer a Worker's blocking question from a terminal. Without a CLI, the HTTP API is the only door and a headless box has no quick way to check readiness. The CLI holds no logic of its own: it calls the server's API.

## What it does

Intended commands, from `docs/design/m0-brief.md` (none exist yet): `forge new`, `forge doctor`, `forge run`, `forge answer`. `doctor` is the planned readiness check (for example harness preflight and host setup warnings such as Windows long paths being disabled).

Public API: none; it is an app.

## Why this approach

- Thin client over the HTTP API, so there is one door to the Director and the same policy applies to every caller (apps are composition only).
- Trigger plane for v1 is chat only, other sources later (d-0002); the CLI is an additional client of the same intake.
- Dependencies: none yet.

## Requirements

- No TypeScript exists yet, so there is no `tsconfig.json` and the root `tsconfig.json` has no reference to this app. The first source file must add `tsconfig.json` and `tsconfig.test.json` (copy `apps/mcp`) and add both to the root `references`; the root `vitest.config.ts` coverage include and threshold need an entry too.
- Node 24.20 and pnpm. Nothing is required today: no source, no tests, no env vars.
- Intended: a running `@forge/server` on `127.0.0.1`.
- Build and test follow the root scripts once source exists.

## Extending

Add a command as a file under `src/` by responsibility (`main.ts` is the only entry), calling the server through a service module and parsing responses with `@forge/core` schemas.

## Limits

- Not implemented yet: no source, no commands, no tests.
- Depends on the server's HTTP API, which is also not built.
- `none yet` for dependencies, env vars and configuration.
