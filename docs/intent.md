# PublicTxt — Intent

Why this plugin exists and the decisions behind its shape. What it does is in `spec.md`, names
in `naming.md`.

## Why

PublicTxt's v1 aim is to "pull selected pages from other people's PublicTxt repos into a local
aggregate view" (publictext `README.md`, Roadmap). `obsidian-publictxt-facets` is the browsing
half and stays offline by design. This plugin is the pulling half: it talks to remote repos and
writes into the vault, only when the user asks.

## First use case

1. Follow a few remote repos.
2. See what changed in them since I last looked.
3. Fork a page I want: copy it into a folder I choose, with where it came from in its front
   matter.
4. Next check, see which of my forks have changed upstream.

## Decisions

- **The fork records its own provenance.** Source repo, path, branch, commit and blob live in
  the forked note's front matter. The list of forks is *derived* by scanning the vault, never
  stored separately: one source of truth, and moving, renaming or deleting a fork needs no
  bookkeeping. Fork provenance is an authored fact (it can't be recomputed), so storing it
  doesn't break publictext ADR-0003 (no derived data on disk).
- **Config and state are separate.** Sources (what I follow) are config. Last-seen commits and
  acknowledged blobs are state: a cache, safe to delete, at worst everything shows as new.
- **Change detection by git blob SHA.** The blob SHA of a file is content-addressed and the same
  on every host. Storing it at fork time also keeps the merge base, which a later
  "update my fork" (three-way merge) or "propose back upstream" needs.
- **Desktop-only, using the git CLI** (decided 2026-11-03). Git gives any host, the user's own
  auth (SSH keys, credential helpers), no API rate limits, full history, and `git merge-file`
  for updating forks later. It matches publictext ADR-0004 (git CLI on the .NET side). PublicTxt
  users keep their notes in git, so desktop users have it. `isDesktopOnly` can go from `true`
  to `false` later without taking anything from anyone; the reverse can't. Node imports stay in
  `src/remote/git-process.ts` so the rest of `src/` ports.
- **Clones live in the vault's `remotes/` folder** (setting), one bare partial clone per source
  (`--filter=blob:none`): history and trees up front, file contents fetched on demand. Bare
  clones have no working files, so no remote `.md` shows up as a note.
- **Follow whole repos, narrow locally** (publictext ADR-0005). A source fetches the whole repo's
  tree; `include` prefixes and `watch` paths filter it on this side.
- **Folder selection reuses the manifest's convention**: repo-relative folder prefixes ending in
  `/` (as `types` and `ignore` in `publictxt.yaml`), not a new glob grammar. Tag filters need
  file contents, so they wait.

## Open questions

1. **Where sources live.** v1: plugin data (`data.json`). Alternative: the vault's
   `publictxt.yaml` `follows`, which makes the follow list public text (ADR-0005 wants that) and
   syncs with the repo. Field names match `follows` so a move is mechanical. `watch` and state
   stay private either way.
2. **Front matter prefix.** `fork_*` (see `spec.md`). `upstream_*` is the git word, `source_*`
   collides with the spec's open `source_repo` (§5), which means "repo this doc lives in".
3. **Canonical repo URL** (publictext spec §13 q2). We need one now, as the key for sources and
   forks. v0 rule in `spec.md`; propose it upstream.
4. **`remotes/` and sync.** Clones are git objects, not notes, but they are in the vault: they
   show in the file explorer and Obsidian Sync or the vault's own git repo would carry them.
   Add `remotes/` to the vault's `.gitignore` and exclude it from Sync; or rename it `.remotes/`,
   which Obsidian neither shows nor syncs. The setting allows either; the default is `remotes`.
5. **Local edits to a fork.** Detecting them needs a hash of the body without the `fork_*` keys.
   Deferred until "update my fork" is built.

6. **Removing a source leaves its clone.** Delete `<remotesFolder>/<host>/<owner>/<repo>.git`
   on remove (asking first), offer a "clean up clones" command, or leave it. Left for now:
   re-adding is then cheap.

## Phases

1. **Desktop** (now): git CLI, as above.
2. **Mobile** (later): a second `RemoteHost` over a host's HTTPS API, no git. A GitHub REST
   adapter was built and tested, then removed when desktop-only was chosen. It is parked at tag
   `archive/github-adapter` as the starting point:
   `git checkout archive/github-adapter -- src/remote/github.ts tests/github.test.ts`.
   `RemoteHost` has changed since (`changes()` returns `Change[] | null`), so expect small fixes. That phase
   brings back the auth and rate-limit questions, and needs a merge that doesn't use git.

## Proposed changes to the publictext spec

Not authoritative there yet; raise when this settles.

- Reserve `fork_repo`, `fork_path`, `fork_branch`, `fork_commit`, `fork_blob`, `fork_date`
  (§5), as authored provenance.
- `follows` entries gain `branch` (default: the remote's default branch) and `include` (folder
  prefixes): the first, simplest piece of the open filter grammar (§13 q1).
- A v0 canonical repo URL (§13 q2).
