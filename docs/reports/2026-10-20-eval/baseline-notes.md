# Baseline arm (plain Claude Code headless, claude-opus-5-5) - notes

Setup: `claude -p "<task> When done ... commit" --output-format json --dangerously-skip-permissions` in baseline-repo, T1..T7 sequentially, no human involvement.

Results: 7/7 committed on main, tests and tsc green after every task, 0 owner interventions, 0 questions, total about 1661 s wall and 4.20 USD. Test count went 33 -> 69.

- Correctness: 6 tasks scored 2, T6 scored 1.
- T6 (vague "import from a browser export"): it asked nothing and guessed. It correctly picked the Netscape HTML format and skipped duplicates by URL, but folder names did not become tags, which is the answer the spec supplies for that question. An owner would find out only after the fact. The one-shot guess was good but not what was wanted, and there was no cheap moment to correct it.
- Over-engineering: mild. T6 added a 133-line parser plus 146 lines of tests (+360 lines), and kept Firefox tags and add dates, which nobody asked for. T4 added no tests for new add/remove. T7 reflowed the earlier Usage text. Nothing unrelated was touched.
- Watching: none needed. Each run was one command, 1 to 7 minutes. Wall time is well above reported API time (T1: 383 s wall vs 336 s duration), so tool and test runs dominate.
- Commit messages are short and sensible. Git warns about LF/CRLF on commit (Windows setting).
- No plan, no review gate and no audit trail beyond git log and the JSON. The agent runs its own npm test and tsc and reports it, but nothing independent verifies this (I verified it afterwards).

Parallel experiment (T5 in clone A, T7 in clone B, concurrent): 113 s wall together (T5 113 s, T7 54 s) vs about 167 s sequential, so about 1.5x, bounded by the longer task. Cost 1.20 USD. Both runs worked fine with zero coordination, since each clone is independent (copied node_modules).
Merge: `git pull ../baseline-par-b main` into A conflicts in README.md (both added a Usage section at the same place). Code files merged cleanly. Plain Claude Code has no merge step, so a human or another agent has to resolve it, and tests would need re-running after the merge (merge aborted, not resolved).
