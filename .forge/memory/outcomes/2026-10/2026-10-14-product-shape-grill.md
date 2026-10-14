# 2026-10-14 — Product shape grill (installed product, company, many repos)

## Why
The user restated what Forge is: an installed product (exe/CLI) a company uses
to manage many repos, operated entirely from the web UI. Earlier decisions
assumed one developer running Forge on this repo; this grill cleared the
collisions.

## Decided
d-0082 installed product, one binary, local mode first, no team features ·
d-0083 GitHub App on the repo; new project from scratch or from GitHub, into a
chosen local folder · d-0084 each install creates its own App via the manifest
flow, Settings page manages it · d-0085 settings/agents/pipelines/skills in the
Forge DB, UI-only, company defaults + per-project overrides (supersedes d-0008,
d-0065, d-0068) · d-0086 project memory in the Forge data folder, optional repo
mirror · d-0087 Paperclip model: user-installed harnesses with their own login,
API key or setup-token (risk accepted) · d-0088 per-install harness version
compat check (supersedes d-0053) · d-0089 Windows first, CI matrix on three OSes
· d-0090 UI is the only control surface; open source later · d-0091 npm first,
exe later · d-0092 background daemon + run resume (supersedes d-0054) · d-0093
localhost only until auth + per-install token · d-0094 one company per install,
multiple GitHub connections · d-0095 onboarding detect → verify → Director chat,
any language (supersedes d-0034) · d-0096 ticket sources as adapters: chat,
then GitHub Issues · d-0097 layered Worker limits, fair queue, quota waits ·
d-0098 per-user data folder, backups, safe updates.

## Pending
- Published npm package name: resolved, `vks-forge` (d-0099).
- Probe: GitHub App repo creation in a personal account.
- d-0096 "more gates" = intake sources: confirmed.
- Code rule 9 reworded to DB + UI config (done this session).
- Change map for all product decisions: `docs/design/product-shape-change-map.md`.
- x-0011 open details (replay size, canary, default pipelines, human steps …).
- Write the design brief covering d-0065..d-0098, then plan slice 3 against it.
- Memory files committed and pushed at the user's request.
