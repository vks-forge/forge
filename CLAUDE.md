# CLAUDE

## Project memory (`.forge/memory/`) — use this, not auto-memory

This repo keeps its own project memory, following `docs/design/memory-system.md`.
Claude's auto-memory (`~/.claude/projects/.../memory/`) holds only user-level
working preferences. Everything about *this project* lives here.

**At session start:** read `.forge/memory/MEMORY.md`, then every file in
`decisions/` with `status: active` and every file in `rejected/`. Treat
`decisions/` as authoritative constraints. Never propose anything listed in
`rejected/` without naming the record and saying why it should be reopened.

**Layout**
```
.forge/memory/
  MEMORY.md        index, ≤200 lines, pointers only
  decisions/       d-NNNN  status: active | superseded
  rejected/        r-NNNN  approaches rejected, with reason
  proposed/        x-NNNN  status: pending → approved (move to decisions/) | rejected (move to rejected/)
  outcomes/        YYYY-MM/  append-only session and ticket outcomes
  JANITOR.md       log of cleanup passes
```

**Write rules**
- User states a decision or constraint → write `decisions/d-NNNN-*.md`,
  `author: user`, `status: active`, quote the message as `source.ref`, add a
  line to `MEMORY.md`. Confirm in one sentence in the reply.
- User rejects an approach with a reason → `rejected/r-NNNN-*.md`, `author: user`.
- Claude infers something (a lesson, a stack pick the user did not state) →
  `proposed/x-NNNN-*.md`, `status: pending`, `author: director`, `confidence ≤ 0.8`.
  Never loaded as a constraint until the user approves. Ask for approval at a
  natural pause, not mid-task.
- User approves a proposal → move the file to `decisions/`, set
  `status: active`, keep the id, add `approved_at`. User rejects → move to
  `rejected/`, add the reason. Update `MEMORY.md` either way.
- Changing a decision → write a new record with `supersedes: <old id>`; set the
  old one to `status: superseded`, `superseded_by: <new id>`, `valid_to`. Never
  edit `statement`, `source`, `author`, or `origin` of an existing record.
  Never delete a record. Never merge two records.
- End of a working session → append one file under `outcomes/YYYY-MM/` with
  what was done, what was decided, what is pending.
- Record ids are sequential per folder. Check the folder before picking the
  next number.

**Hygiene**
- `MEMORY.md` stays an index. If it passes 200 lines, archive the oldest
  outcome pointers, never the decisions.
- A janitor pass (dedupe, contradiction flags, index rebuild) is manual for
  now: run only when the user asks, log it in `JANITOR.md`, propose changes
  as a diff, do not apply them silently.

## Code rules

`.claude/rules/code.md` is binding for all source under `apps/` and
`packages/`: layers point inward, one interface many adapters, harness-neutral
core, zod schemas as source of truth, one door per policy path, contract tests
per interface, gates green before merge. Builder subagents read it first.

## Research base

This repo has a hyperresearch vault under `research/`. Do not load its docs by default. When doing research, searching `research/notes`, running or resuming a hyperresearch run, or citing vault notes, invoke the skill `hyperresearch-vault` first (it holds the CLI path, run/verify commands, vault search, scholar APIs, OA rules, untrusted-content policy, and the curation checklist). `/hyperresearch <query>` still starts the full pipeline.
