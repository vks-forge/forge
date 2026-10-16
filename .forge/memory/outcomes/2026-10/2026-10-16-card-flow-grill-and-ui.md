# 2026-10-16 — Card-first Director flow grill; UI fixes; delete/archive projects

## Done (all on main)
- 7da86e9 — any-folder projects + wizard, settings redesign, notifications, tooltip,
  delete project, inbox fixes (installed-build tool approvals, no 1970 dates), board
  redesign (interim), base-branch errors park with a clear reason.
- 67a66d7 — tests compare git paths with the canonical temp dir (CI red on macOS
  /private/var and Windows 8.3 names; fixed forward, CI green on all 3 OSes).
- 8bc1e48 — archived projects in the switcher with Unarchive (d-0157), shared Picker
  replacing all native selects (d-0154), board columns fit the screen with a
  collapsible Closed strip.

## Decided
- d-0127 delete project; d-0128..d-0156 card-first Director flow (card popup,
  grill in card chat, playbooks, read-only Forge read tools, plan tab + versions,
  approval behind a deterministic floor, ticket escalations, multi-agent pipelines,
  agents area, Director settings, lane pipelines per project, Picker, research
  later); d-0157 archived projects; d-0158 build ON HOLD.
- Superseded: d-0107 -> d-0139, d-0108 -> d-0142, d-0145 -> d-0146.
- Enhance-decisions report accepted (d-0141); cost is warning-only (d-0143).

## Pending
- Card-first flow build (docs/briefs/card-first-flow-plan.md, S1 brief written) —
  on hold until the owner resumes.
- Web test-teardown warnings ("Timeout terminating forks worker") in ~10 files.
- README banner/logo (owner will provide prompts-based images later).
- MEMORY.md is near its 200-line cap; a janitor pass (owner-run) would compact it.
- Docker/SearXNG stopped to save RAM; research via built-in web fetch for now.
