# AA: per-harness "Bypass permissions" setting, default on (builder brief)

Decision d-0183 (supersedes r-0005; amends d-0175, d-0182, d-0117). Queue item AA, plan step 3.0. Binding:
`.claude/rules/code.md` (rule 2 one interface many adapters, rule 3 harness-neutral core: the flag is the driver's,
rule 6 one `admit()` door, rule 9 config is data edited in the UI), d-0001, d-0176.

## Behaviour

- Each harness in Settings → harnesses has a switch "Bypass permissions", **on by default**, with a plain warning:
  "Workers run without asking you. Forge still blocks secrets, Forge's own data folder, files outside the ticket's
  workspace, pushing and destructive commands. Workers run as your Windows account, so this is a Forge rule, not a
  Windows boundary."
- **On:** the driver starts the harness in its own no-prompt mode (Claude Code: `--permission-mode bypassPermissions`
  instead of `default` in `packages/drivers/src/domain/cli-args.ts`; other drivers map their own flag or declare
  they cannot via `capabilities()`). In `admit()` every `ask` outcome becomes `allow`, except the **hard floor**,
  which still denies: Forge's data folder and secrets (`data-home-floor.ts`, secret paths), paths outside the
  worktree, `git push` and other publishing, destructive command classes (`command-classes.ts`). Receipts, hooks
  and G1 are unchanged.
- **Off:** today's per-lane allow / ask rules (d-0175, d-0182 routine list).
- Express keeps its own unattended rules (ask → deny) unless the switch is on, in which case ask → allow as above.

## Design

1. **Core**: harness config schema (`packages/core/src/schemas/harness.ts` or the harness options schema used by
   config versions) gains `bypass_permissions: boolean` default `true`; seed / builtin config sets it; `RunRequest`
   gains a harness-neutral `permissions: 'bypass' | 'ask'` (no harness names in core).
2. **Engine / server composition**: when building a run request, read the harness setting and set `permissions`;
   pass the same flag into the admit context of that run's grant (the lane stays read from the grant only).
3. **Tools**: `admit()` takes `context.bypass` from the grant; a new pure step turns a final `ask` into `allow`
   with reason `bypass` unless the deciding rule is in the hard-floor set; every hard-floor rule is named in one
   list (`domain/hard-floor.ts`) with tests. Decision records note `bypass` so the history shows why a call was
   allowed.
4. **Drivers**: Claude driver maps `permissions: 'bypass'` to `--permission-mode bypassPermissions`; declares
   `capabilities().permissionBypass = true`. A live probe (allowed without asking, owner preference) confirms the
   PreToolUse hook still fires and can deny under bypassPermissions; result appended to the probes RESULTS file.
   If the hook does not fire under bypass, fall back to `default` mode with Forge's allow list = everything except
   the floor, and say so in the report.
5. **Web**: switch + warning on the harness settings page, saved as a new config version (d-0085). Builder invokes
   hallmark and nielsen-heuristics first.

## Tests (red first)

Tools: ask → allow under bypass; each hard-floor rule still denies under bypass; off → ask unchanged. Drivers:
cli args per mode. Engine: run request carries the flag from the harness setting; default on. Server/web: setting
saved and shown. Live probe as above (heavy / probe project).

## Docs

`docs/design/execution-plane.md` §6 and `tool-system.md` (bypass mode and hard floor), tools and drivers READMEs,
`PRODUCT.md` (known limits: Workers run as the owner's account), security notes.

## Builder steps

- **AA-1**: core + tools + drivers (+ probe).
- **AA-2**: engine/server wiring + web setting.
