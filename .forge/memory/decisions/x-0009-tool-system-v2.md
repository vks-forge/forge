---
id: x-0009
kind: proposed
statement: Tool system v2 — one signed catalogue with declared, probe-verified risk and schema-hash quarantine; floors that nothing bypasses; capability gate (narrowing intersection, deny wins) then call-time rules (last-match, longest-prefix shell, banned always-allow list, managed deny layer) then monotone fail-closed inspectors then hash-bound approvals with timeout-tightens and unattended deny on Express; one admission function covering list, call, nested and code-mode calls; hash-chained decision + effect receipts with enforced_by; checkpoint before every mutation; per-tool budgets; MCP governance with trust tiers and untrusted envelope; web via factory tools only with SSRF guard and credential broker.
source: { type: chat, ref: 2026-10-12 user request "do reverse engineering on the other open source projects so we can make this top notch" }
author: director
origin: agent
status: superseded
superseded_by: d-0038
valid_to: 2026-10-12
approved_at: 2026-10-12
valid_from: 2026-10-12
supersedes: x-0008
confidence: 0.85
tags: [tools, mcp, permissions, execution-plane, ledger, research]
---
Design: `docs/design/tool-system.md` (v2). Evidence: 13 systems read at
source, reports in `research/notes/tool-system/`. §14 lists nine things no
surveyed system does; §15 lists the anti-patterns we avoid.

Approved 2026-10-12 (user: "ok approved").
