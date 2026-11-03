# PublicTxt — Spec

What the plugin does. Why in `intent.md`, names in `naming.md`. Draft: nothing released.

## Data

`data.json` holds `{ version, forkFolder, remotesFolder, gitPath, sources, state }`.

| Field | Default | Meaning |
|---|---|---|
| `forkFolder` | `''` | Default vault folder for forks (`''`: the vault root) |
| `remotesFolder` | `remotes` | Vault folder holding the clones; never empty |
| `gitPath` | `git` | The git executable. Set it when Obsidian doesn't see the shell's PATH (macOS apps started from Finder) |

## Source

A remote repo the user follows. Stored in plugin data under `sources`.

| Field | Type | Rule |
|---|---|---|
| `url` | string | Canonical repo URL (below). Unique; the source's key |
| `branch` | string \| null | Branch to track. `null`: the remote's default branch |
| `include` | string[] | Folder prefixes ending in `/`, repo-relative. Empty: the whole repo. Narrows "what's new" only |
| `watch` | string[] | Repo-relative file paths to report on whenever they change, even outside `include` |
| `folder` | string \| null | Default vault folder for forks from this source. `null`: the plugin's default |

Normalising (`normalizeData`): unknown keys dropped, invalid sources dropped, `url` made
canonical, duplicates by `url` dropped (first wins), `include` given a trailing `/`, leading `/`
stripped from paths, paths with `.` or `..` segments dropped, lists deduped.

### Canonical repo URL (v0)

`https://<host>/<owner>/<repo>`: scheme and host lower-cased, `.git` suffix, trailing `/`,
query and fragment dropped. `git@host:owner/repo.git` becomes the HTTPS form. Owner and repo
keep their case (hosts differ on case sensitivity). Anything else is invalid.

## Sources settings

The settings tab lists sources (URL, branch, include, watch count, fork folder) with edit and
remove; **Add source** opens a form. Lists are one path per line. Logic is in
`src/sources/edit.ts`, pure and tested; the form is `src/ui/source-modal.ts`.

- Add: the URL must be canonical-able and not followed already.
- Edit: in place; the URL is the key, so it is read-only (a different repo: remove, add).
  State is kept.
- Remove: drops the source and its state. Its clone stays under `remotesFolder` (open question).

## State

A cache, per source `url`. Safe to delete. State for a source no longer followed is dropped.

| Field | Meaning |
|---|---|
| `seenCommit` | Head commit at the last check the user acknowledged. `null`: never checked |
| `checkedAt` | ISO datetime of the last check |
| `watched` | `path → blob SHA` last acknowledged, per watched path |

## Fork provenance (front matter)

Written into a forked note's front matter, flat so Obsidian Properties can show and edit them.
Remote front matter is kept; these keys are added or overwritten.

| Key | Value |
|---|---|
| `fork_repo` | Canonical repo URL |
| `fork_path` | Repo-relative path of the file forked |
| `fork_branch` | Branch it was forked from |
| `fork_commit` | Head commit SHA at fork time |
| `fork_blob` | Git blob SHA of the file at fork time: the change marker and merge base |
| `fork_date` | ISO datetime of the fork, with offset |

A note is a fork when `fork_repo`, `fork_path` and `fork_blob` are valid; the rest are optional
when reading. The list of forks is derived by scanning the vault (`intent.md`).

## Check

Per source, against the tracked branch's head:

1. Fetch, then read the head commit and the recursive tree (`path → blob SHA`).
2. **What's new**: files changed between `seenCommit` and head, within `include`. If
   `seenCommit` is null, or `changes` is `null` (history rewritten): list every file in
   `include` as new, and say why.
3. **Watched**: each `watch` path whose blob differs from `watched[path]`, or that is gone.
4. **Forks**: each fork of this source whose `fork_path` blob at head differs from `fork_blob`,
   or that is gone.

Acknowledging moves `seenCommit` and `watched` forward. Forks are acknowledged only by updating
them (later slice), since their state is their front matter.

## Remote host

`RemoteHost` (`src/remote/host.ts`) is all the check and fork steps use. `GitHost`
(`src/remote/git.ts`) implements it with the git CLI, one bare partial clone per source at
`<remotesFolder>/<host>/<owner>/<repo>.git`. Commands run without a shell, with
`GIT_TERMINAL_PROMPT=0`, one at a time per clone.

| Method | git |
|---|---|
| (first use) | `clone --bare --filter=blob:none`, then `remote.origin.fetch = +refs/heads/*:refs/heads/*` |
| `head` | `fetch --prune`; `ls-remote --symref origin HEAD` when `branch` is null; `rev-parse` the commit and tree |
| `tree` | `ls-tree -r -z`, blobs only (submodules skipped) |
| `changes` | `null` if `base` is unknown or not an ancestor (`cat-file -e`, `merge-base --is-ancestor`); else `diff --name-status -z -M` |
| `blob` | `cat-file blob`; a partial clone fetches it on demand |

Errors are a `RemoteError` by `kind`: `no-git` (git can't start), `git` (a command failed),
`not-found` (branch or default branch missing), `bad-input` (not a canonical URL or SHA).

## Fork

User picks a file from a check (or the source's tree) and a target folder (source `folder`, else
the default). The plugin fetches the blob, writes `<folder>/<file name>`, then adds the
provenance keys. A name clash asks; it never overwrites.

## Build order

1. Done. Schema: data types, `normalizeData`, canonical URL, fork provenance read/write. Pure, tested.
2. Done. Git host: head, tree, changes, blob over the git CLI. Tested against real git and
   temporary repos.
3. Sources settings: add, edit, remove. Done.
4. Check view: what's new, watched, forks.
5. Fork command.
6. Later: update a fork (`git merge-file` on `fork_blob`), propose upstream, tag filters.
7. Mobile phase (`intent.md` → Phases).
