# @forge/secrets

SecretStore adapters: an encrypted-at-rest store for Windows (DPAPI) and an in-memory one for tests.

## Why it exists

The server authenticates to GitHub as an App, and that needs the App's private key. A key that
sits as a plaintext `.pem` in the repo, in `.forge/` config or in an environment variable can be
read by any process, committed by accident, or picked up by a Worker running as the same user.
The Director (server) must be able to read the key at push time while the key stays useless if the
file is copied. Without this package the choice would be plaintext on disk or a bespoke scheme in
the GitHost adapter. The `SecretStore` port (in `@forge/core`) keeps the server, the GitHost adapter
and the CLI ignorant of how a secret is protected (d-0062).

## What it does

Public API from `src/index.ts`:

- `createDpapiSecretStore({ dir, powershell?, platform? })` returns a `SecretStore` that keeps
  `<dir>/<name>.dpapi` blobs encrypted with Windows DPAPI in `CurrentUser` scope. `put` encrypts and
  writes atomically (temp file, then rename); `get` returns the decrypted bytes or `null` for a
  missing secret. A corrupt or foreign blob raises a `CrashError`. Off Windows the constructor throws
  `PolicyDeniedError` instead of falling back to plaintext. `powershell` and `platform` exist so tests
  can prove the failure paths.
- `createMemorySecretStore()` returns a `SecretStore` backed by a `Map`, with defensive copies in and out.

Names must match the core `SecretName` schema (`^[a-z0-9][a-z0-9-]*$`). Anything else, including `../x`,
`a/b`, `A.pem` or a drive letter, throws `InvalidInputError` before a path is built.

## Why this approach

- DPAPI through a fixed `powershell.exe -NoProfile -NonInteractive -Command <script>` using
  `System.Security.Cryptography.ProtectedData` with `CurrentUser` scope. The plaintext goes to the child
  as base64 on stdin and the ciphertext comes back as base64 on stdout, so it is never in argv (visible in
  process lists) or the environment, and no temp file holds it. No `shell: true`, and no caller input is
  ever interpolated into the script. Rejected: a native addon or `node-dpapi` (a native build with Windows
  toolchain caveats, code.md rule 11); storing the key in an env var or `.forge/` yaml (readable by every
  process of the user).
- CurrentUser scope, not LocalMachine: other accounts on the box cannot decrypt the blob.
- No entropy parameter: the threat model is a copied file, not another process of the same user; a second
  secret to manage would only move the problem.
- One contract (`describeSecretStoreContract`) runs against every adapter, so the memory fake used in other
  packages' tests behaves like the real store.

## Requirements

- Runtime: Node 24 or newer. The DPAPI adapter needs Windows with Windows PowerShell 5.1 (`powershell.exe`,
  present on every supported Windows) and the .NET `System.Security` assembly (part of the framework).
- No environment variables. Files: `.forge/data/secrets/<name>.dpapi` (git-ignored with the rest of
  `.forge/data/`), written by `forge secret wrap`.
- Tests: `pnpm test`, or `npx vitest run packages/secrets`. The DPAPI cases run only on Windows and use a
  temp directory with a real round trip; they take a few seconds because each call starts PowerShell.

## Extending

A new platform store (macOS Keychain, Linux Secret Service) goes in `src/adapters/<name>/`, takes its
options as arguments, validates names with `assertSecretName`, and must pass `describeSecretStoreContract`
from `__tests__/contract/secret-store.contract.ts`. Add a `*.test.ts` that calls it, gated on the platform.

## Limits

- Windows only for real encryption; other platforms can use the memory store (tests) but not DPAPI.
- A process running as the same Windows user can decrypt the blobs; DPAPI protects against file theft, not
  against code running as you.
- Each operation starts a PowerShell process (about 100 to 400 ms); the server reads the key at token-mint
  time, not per request.
- No delete or list operation; the port has only `get` and `put`.
