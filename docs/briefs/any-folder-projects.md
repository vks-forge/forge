# Brief: any folder can be a project (d-0124) + new-project wizard modal

Decision: `.forge/memory/decisions/d-0124-any-folder-project-local-git.md` (amends d-0083).

## User asks (2026-10-16)
1. New project is a big modal with a step-by-step form and proper validation, not a page.
2. Folder browser popup: create folder, right-click context menu on folders, sort by name / date.
3. Forge works on every folder. No git → tell the user git is needed and init a local repo
   (snapshot commit default, or init only — user picks). No remote → verified work merges locally
   and this must work with the agents end to end. Folder inside a repo → user picks: use repo top
   (default) or scope project to the subfolder. Never a nested git init. Validated project-wide.
4. Browser list: no text selection on double-click.
5. Remove the "Repository folder" text box; folder is chosen via Browse only. Smooth, clean UX.

## Shared API contract (both builders code to this; zod schemas in packages/core)

`POST /projects/inspect` body `{ path }` → `ProjectInspection` gains:
```
git: {
  state: 'repo' | 'none' | 'inside_repo',
  repo_root: string | null,        // top folder when repo or inside_repo
  subfolder: string | null,        // relative path from repo_root when inside_repo
  has_commits: boolean,
  dirty: boolean,
  remote: { name: string, url: string, github: { owner: string, repo: string } | null } | null,
}
snapshot: { files: number, bytes: number, has_gitignore: boolean, truncated: boolean } | null  // when state none
```
Existing fields (current_branch, branches, ecosystems, checks) are filled for `repo`, for
`inside_repo` (from repo_root, checks detected in the subfolder), and for `none` (ecosystems/checks
detected from files; branches empty). Unrecoverable folder problems keep their typed error codes.

`POST /projects` body gains:
```
git_setup?: { mode: 'snapshot' | 'init_only' }   // required when inspect said state 'none'
scope?: { mode: 'root' | 'subfolder' }           // required when 'inside_repo'; root => folder := repo_root
connection_id?: optional                         // GitHub connection only when a GitHub remote is used
```
Init only ⇒ the project registers but is "waiting for first commit": dispatch refuses with a
clear Needs-you message until the base branch has a commit.

Folder browser (`apps/server` routes, read+create only):
- `GET /fs/folders` entries gain `modified_at` (ISO) so the UI can sort by date.
- `POST /fs/folders` `{ parent, name }` → creates one folder (validate name: no separators,
  no reserved Windows names, no trailing dot/space; 409 if exists). Returns the entry.
- `POST /fs/reveal` `{ path }` → opens the folder in Explorer / Finder / xdg-open (same per-OS
  lookup style as services/folder-picker). Auth + Origin check like every unsafe route.
- Rename/delete are out of scope.

## Builder A — backend (core, git, engine, server)
- Inspect + register per contract; one door for folder checks stays `assertProjectFolder`.
- Local git setup at register: `git init -b <main>`, write a standard `.gitignore` only when
  missing (node_modules, dist/build/out, .env*, *.log, OS junk, .venv, __pycache__, target/, bin/obj),
  snapshot commit "Initial snapshot (Forge)" with a Forge identity set via `-c user.name/-c user.email`
  (don't write the user's global config). Refuse snapshot above a size guard (e.g. 20k files or
  1 GB staged) with a typed error telling the user to add ignores first.
- Subfolder scope: store `repo_root` + `subfolder` on the project (migration). Worktrees are made
  from repo_root; Worker cwd, checks' default working dir, path-guard / tool floors and the gate diff
  check are scoped to the subfolder (a diff outside it fails the gate). Read code.md rule 6 (one door).
- Local merge: a `GitHost`-style adapter for projects without a remote, picked by config/registry
  (no `if` on harness/host in core). Verified branch merges into the base branch via the existing
  `merge()` door. Safety: if the base branch is checked out in the user's folder and that tree is
  dirty, do not merge — raise a Needs-you interaction ("commit or stash your changes, then retry");
  if clean, merge in place (no-ff or ff per project setting default no-ff); if not checked out,
  update the branch via a temporary worktree. Never force, never reset the user's tree.
- End to end with agents: dispatch → worktree → Worker → G1 gate → local merge → ticket done.
  Add an engine/server integration test on a temp folder with no git: register (snapshot), run a
  scripted Worker through the rig, gate passes, merge lands on main, ticket ends `done`. Also
  init-only refusal, dirty-tree Needs-you, subfolder diff outside scope fails gate.
- Migrations next free number; README of each touched package; PRODUCT.md line.

## Builder B — web (wizard modal + folder browser) and the two fs endpoints
- Replace `/projects/new` page with a large modal (reuse `components/ui/modal.tsx`; backdrop click
  does not close; dirty close asks to discard). Route `/projects/new` opens the modal over the
  current page (or keep route but render modal) so deep links still work; first-run wizard's project
  step uses the same step content.
- Steps (stepper header with numbered steps, progress, Back/Next, Enter = Next, validation per step,
  errors inline under fields in plain words, Next disabled until valid):
  1. Folder — big Browse area (native picker; in-app browser fallback). No text box. Shows the
     chosen path as a chip with "Change". Runs inspect automatically.
  2. Git — shows what Forge found: repo ✓ / no git (explain git is needed; radio: Snapshot commit
     (default, shows files+size, notes .gitignore will be added) / Init only) / inside a repo
     (radio: Use repo top (default, shows path) / Only this subfolder). Remote shown if any;
     GitHub connection picker only when the remote is GitHub.
  3. Details — name, slug, prefix, base branch (validated live; existing rules).
  4. Checks — detected checks, editable list.
  5. Review — summary of everything, Create button; progress while creating; success → close and
     go to project Home with a notification (use the notify system if present, else inline).
- Folder browser (in-app): sort menu (Name A–Z/Z–A, Date modified newest/oldest), "New folder"
  button + inline name input, right-click / Shift+F10 / context-menu key menu on a folder (Open,
  Select this folder, New folder inside, Copy path, Show in Explorer/Finder), `select-none` on the
  list (no text highlight on double-click), keyboard intact.
- Tests with `__tests__/helpers/fetch-stub.ts` (d-0123): step validation, git choices sent in body,
  browser sort, new folder, context menu actions.
