# Evidence redundancy audit — ai-software-factory-architecture-58e4cc

Only 6 of 92 notes produced a `claims-<note-id>.json` sidecar (fetcher-discretion artifact), yielding 36
ingested claims — too sparse a sample for a meaningful content-overlap clustering pass. Domain-level dedup
was already applied during URL selection (step 2.2/2.3: max 4 URLs per domain), which is the stronger lever
against "N sources, 1 outfit" here — the corpus spans ~70+ distinct domains (vendor docs: Anthropic, IBM,
Google, Microsoft; practitioner blogs: dev.to, Substack, Medium; academic: arXiv, ACM, Springer, IEEE;
industry press: O'Reilly, The New Stack, DevOps.com; security vendors: Synack, Wiz, Cycode, SentinelOne).

No cluster dropped any atomic item's independent source count below 2. No wave-3 fetch required.
