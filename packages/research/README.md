# @forge/research

The one door to the outside web: web search and page fetch behind a `ResearchProvider`, with the SSRF guard that every fetch passes.

## Why it exists

Forge reaches the web in two places. The Director's research step looks up facts a repository cannot
answer (a library's rate limit) before it asks the owner or writes a plan, and a Worker's `web_search`
and `web_fetch` tools read documentation. Both read pages written by strangers, and both could aim the
Forge host at its own network (a loopback service, the LAN, cloud metadata) if the fetch were careless.
Before this package the guard lived inside the MCP server, so the Director had no web access at all and
the Worker's tools were configured only by environment variables, which meant unconfigured in production.

This package is that one door. The engine and the MCP server get a `ResearchProvider` built from the owner's
settings and never open a socket themselves. Without it each caller would carry its own copy of security
code, a change of search backend would touch the engine, and a provider that is off or down would be an
exception in the middle of a planning tick instead of a note on the card.

## What it does

Public API (`src/index.ts`):

- `createResearchProvider(settings, net?, now?)` builds the provider the settings name. The provider id picks
  a factory from a map (`ProviderFactories`), never an `if` chain, so adding a backend is a new folder and an
  entry there. `net` replaces the production network ports in tests.
- `nodeNetwork()` returns the production ports: system DNS (every A and AAAA answer), an address-pinned HTTP
  transport and the platform `fetch`.
- `createSearxngProvider()`: search through the owner's SearXNG (`format=json`, the endpoint must be loopback or
  an exact host the owner listed, redirects refused, body read through a 1 MB capped stream, hits cut to
  title, URL and a 300-character snippet, non-http links dropped); fetch and `health()`.
- `createNoneProvider()`: declares no capability and answers every call `not_configured` in plain words;
  never touches the network.
- `guardedFetchText()` (the fetcher): http(s) only, no credentials, ports 80/443 (8080/8443 for an explicitly
  allow-listed host), DNS resolved inside the call's time box and refused if any answer is private, loopback or
  link-local, the socket opened to the vetted address, redirects followed by hand (at most 5, each
  re-checked, https to http refused), text content types only, a byte cap, deny hosts refused with their
  subdomains. It returns the text (HTML reduced to text), the page title, the byte count, the content type and
  the SHA-256 of what it read.
- `toResearchError()` maps a guard or network failure to the port's typed error (`not_configured`, `denied`,
  `unreachable`, `timeout`, `too_large`, `bad_content`, `http_error`). A provider never throws on a refusal or
  an outage.

The port, the settings schemas and the pure rules (quote checking, fetch provenance, the untrusted-content
envelope) are in `@forge/core`; the admission of the Director's requests is `admitResearch()` in `@forge/tools`.

## Why this approach

- One door (d-0144): a single provider for the Director and for Workers, so the SSRF floor is one piece of
  code with one set of tests. Rejected: a second copy of the guard on the engine side (it is security code,
  and a copy drifts).
- SearXNG first (d-0144, tool-system.md §9): self-hosted and keyless, so no key to store and no queries leaving
  the machine for a third party; the endpoint check means a mis-set URL cannot leak them. Rejected: a keyed
  provider first (keys, cost); the harness's own web tools (denied, r-0005).
- Resolve, validate every answer, then dial the vetted address (defeats DNS rebinding), and re-validate every
  redirect. Rejected: validating the host name text only, and letting the HTTP client resolve again.
- Provider choice is settings, not code (code.md rule 9, d-0085, d-0090): rows in the database, edited in the
  UI; environment variables are a development override only.
- No new dependency: `node:net`, `node:http(s)`, `node:dns`, `node:crypto`, zod (already pinned).

## Requirements

- Node 24. Imports `@forge/core` only (and `zod`); no other adapter package.
- For the SearXNG provider: a SearXNG instance at the configured base URL (default `http://localhost:8888`,
  for example the `searxng-openclaw` container). Without it the provider answers `unreachable` and research
  notes that it did not answer.
- Tests: `pnpm vitest run --project unit packages/research`; they use fake ports and a loopback fake server and
  need no network. The contract `__tests__/contract/research-provider.contract.ts` runs against `searxng` and
  `none`.

## Extending

1. Add `src/adapters/<name>/` with a factory `(settings, net, now) => ResearchProvider`.
2. Add the id to `ResearchProviderId` in `@forge/core` (`schemas/research-settings.ts`) and an entry to
   `ProviderFactories`; the compiler demands both.
3. Run `describeResearchContract()` against it before writing its own tests: it must refuse private addresses,
   non-http schemes and banned hosts, and must never throw from `search`, `fetch` or `health`.
4. A provider that reports a price returns `cost_usd` from `search` and declares `reportsCost`; the engine adds
   it to the card's spend.

## Limits

- Text only: HTML is reduced to text, other text types are passed through, everything else is refused.
- No cookies, credentials or JavaScript; pages that need them read as empty or fail.
- Search results are only as good as the configured SearXNG engines; there is no ranking of its own.
- A secret that appears in a query is sent to SearXNG as written: the engine logs queries on the card and the
  research input carries no file contents, but the model chooses its queries.
- The settings are read when a provider is built: the server rebuilds it when the company settings change; the
  per-run MCP process builds it once at start.
