---
kind: outcome
date: 2026-10-12
session: scope review, self-improvement research, tool-system reverse engineering
author: system
origin: system
---
- Decision review of the six design docs → `docs/design/v1-scope-review.md`; walking-skeleton cut approved as x-0006 after user overrides (multi-harness in v1, per-task validation, TDD on major work, own enhancement skill, self-improving skills/agents).
- New user decisions d-0015..d-0019; d-0014 superseded by d-0017.
- Self-improvement design `docs/design/self-improvement.md`; three research surveys (12 systems, 24 papers, production practice) in `research/notes/self-improvement/`; amendments approved as x-0007. Form: system with one skill inside.
- Tool system: v1 draft, then source reads of 13 systems (seven reports in `research/notes/tool-system/`), v2 design approved as x-0009.
- All proposals resolved; pending list empty.
- Next: grill (d-0017) on x-0006 + x-0009, write `enhance-decisions` and `skill-author` skills, then M0 brief.
- Grill session (21 questions) → d-0020..d-0030; `enhance-decisions` skill written (`.factory/skills/enhance-decisions/SKILL.md`) and run → `docs/design/reviews/2026-10-12-enhance-pass.md` (keep 5 / change 9 / drop 0); user finalized → d-0031..d-0039 supersede the changed ones.
- Docs patched: execution-plane (ACP-first driver, `--bare` only in api_key mode, fail-closed hooks), control-room (worktrees in repo, credential modes), tool-system (M0 tokenizer, signatures from main HEAD), verification-plane (profile ts|generic), v1-scope-review §9.
- `docs/design/m0-brief.md` written: preconditions (remote URL, bot token), layout, four slices with exits, three preflight probes, M0.5 driver wave.
- Blocked on user: GitHub remote URL (P1) and bot token (P3); then `git init` + first commit on "go".
- 2026-10-13 follow-up: org `vks-forge`, repo `forge`, GitHub App `forge-software-factory-bot` (App and installation ids kept out of the repo; see the operator's local notes) created; private key saved under `.factory/data/secrets/` (ignored). `git init -b main`, commit `56e0551` (644 files) pushed to `https://github.com/vks-forge/forge`. Git identity set locally in the repo (not recorded here). Open: project slug/ticket prefix (`forge` / `FG` proposed), revoke exposed App client secret, then slice 1.
