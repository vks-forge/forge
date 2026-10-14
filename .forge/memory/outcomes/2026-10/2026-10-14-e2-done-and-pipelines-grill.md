# 2026-10-14 — E2 finished and pushed; pipelines-as-config grill (paused)

## Done
- E2 (slice 2 items 6 + exit) built, reviewed twice by Fable, fixed, verified and
  pushed: `origin/main` 2473f18 → 53a3ae9 (11 commits). Final run: typecheck,
  lint, format green; full suite 3621 passed / 18 skipped; live probes 1–9 all
  pass (probe 8 real Claude Express ticket intake → merge; probe 9 real GitHub
  PR open → close, no merge). Slice 2 exit criteria met.
- Readable layout rule (d-0063) applied repo-wide; 300-line limit lint-enforced.
- Measured harness facts recorded: d-0064 (ACP announces tool calls before
  input streams), d-0067 (Claude Code defers MCP schemas behind ToolSearch;
  Workers run with `ENABLE_TOOL_SEARCH=false`).
- GitHub App ids and git email removed from tracked files (history unchanged).

## Decided (grill of proposal x-0011, agents and pipelines as config)
d-0065 agent files = Markdown + frontmatter · d-0066 pipelines are graphs ·
d-0068 governance: files now (signed, tier C, Workers locked out), later UI
approve, end state DB + UI-only, admin-only with ACL, read via a source port ·
d-0069 lane default + routing rules · d-0070 typed artifacts, per-agent inputs,
reviewers never see the Worker narrative · d-0071 reviewers advisory, critical
/high holds auto-merge · d-0072 budgets per agent only · d-0073 critic is a
different model family · d-0074 script gates · d-0075 replay + canary for
pipeline changes · d-0076 parallel reviewers and writers, Director decides ·
d-0077 Director builds each ticket's pipeline with no safety floor (amends
d-0001, d-0006, d-0069; risk accepted by the user) · d-0078 per-agent skills and
memory slice · d-0079 notify via control room + desktop · d-0080 retry →
fallback list → Director substitute · d-0081 scorecards for the Director.

## Pending
- x-0011 stays `pending`: the user has more to discuss before a brief is
  written. Next session: continue the discussion, then write
  `docs/design/briefs/pipelines-x0011.md` from d-0065..d-0081.
- Open details for that brief: replay set size, "worse" threshold, canary size,
  real-vs-false finding rule, default pipeline per lane, human step types,
  per-project overrides, secrets for agents, UI editing flows.
- Prior-art research blocked: SearXNG needs Docker Desktop running.
- Known limits carried: Worker-written code runs in project checks as the
  user's Windows account (isolation needs d-0005 containers/WSL2); CLI fallback
  host Claude 2.1.296 ≠ reviewed 2.1.293 (native tools denied until re-probed);
  rework path tested only in unit/e2e, not live.
- Next milestones: slice 3 control room, slice 4 dogfood (`FG-` tickets).
