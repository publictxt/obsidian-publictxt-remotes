# PublicTxt Remotes — Spec

What the plugin does. Why in `intent.md`, names in `naming.md`. Draft: nothing released.

## Data

`data.json` holds `{ version, forkFolder, matchFolders, listForks, remotesFolder, gitPath, state, localPaths }`. Sources are notes (below).

| Field | Default | Meaning |
|---|---|---|
| `forkFolder` | `''` | Default vault folder for forks (`''`: the vault root) |
| `matchFolders` | `true` | Fork into the remote file's folder when the vault has that exact folder |
| `listForks` | `false` | Keep a fork list in each follow note (Fork list, below) |
| `remotesFolder` | `.remotes` | Vault folder holding the clones; never empty. Hidden, so Obsidian doesn't index it and Sync skips it |
| `gitPath` | `git` | The git executable. Set it when Obsidian doesn't see the shell's PATH (macOS apps started from Finder) |
| `localPaths` | `{}` | Remote name → absolute folder of each local source on this computer (Local sources, below). Never in a note |

## Source

A repo the user follows, hosted or on this computer (Local sources, below): a note in the
top-level `follows/` (any depth), one per repo
(publictext ADR-0014, spec §3.2). The list of sources is derived by scanning that folder, never
stored. The note's body is the user's own prose; the plugin only touches its front matter, and
its fork list when it keeps one (Fork list, below).

The note's file name, without `.md`, is the source's **remote name**: `follows/research.md` is the
remote `research`. Forks record it (`fork_remote`). A name can't start with `.` or a space, or
contain `\ / : * ? " < > | # ^ [ ]`; names are unique, compared without case.

| Key | Type | Rule |
|---|---|---|
| `url` | string | A hosted source's canonical repo URL (below). Required unless `local` |
| `local` | `true` | Plugin only. A local source: no `url`; its folder is in `localPaths`, never in the note |
| `branch` | string | Branch to track. Absent or blank: the remote's default branch |
| `include` | string or list | Folder prefixes ending in `/`, repo-relative. Empty: the whole repo. Narrows "what's new" only |
| `watch` | string or list | Plugin only. Repo-relative file paths to report on whenever they change, even outside `include` |
| `folder` | string | Plugin only. Default vault folder for forks from this source. Absent: `forkFolder` |
| `list_forks` | boolean | Plugin only. Keep this note's fork list (`true`) or not (`false`). Absent, or not a boolean: the `listForks` setting |

`url`, `branch` and `include` are the spec's; `local`, `watch`, `folder` and `list_forks` are this
plugin's, which other readers ignore. They are public with the note.

A source's **key** (`Source.url`; what state, clones and checks use) is its canonical URL, or
`local:<name>` for a local source.

Reading (`readFollow`): `local: true` makes a local source, whatever its `url`; otherwise no
valid `url`, not a source. `url` made canonical, `include` given a trailing `/`, leading `/`
stripped from paths, paths with `.` or `..` segments dropped, lists deduped, a single string
read as a one-item list. Two notes with one URL, or one name: the first by path (byte order)
wins; the others are shown as duplicates.

### Canonical repo URL (v0)

`https://<host>/<owner>/<repo>`: scheme and host lower-cased, `.git` suffix, trailing `/`,
query and fragment dropped. `git@host:owner/repo.git` becomes the HTTPS form. Owner and repo
keep their case (hosts differ on case sensitivity).

Anything else is invalid, `file:` URLs included: a local source has no URL in its note.

## Sources settings

The settings tab lists the sources found in `follows/` (name; URL, or a local source's folder
here, or that it has none; branch, include, watch count, fork folder, fork list when set, note
path), any duplicate or invalid notes, and **Add source**. Lists are one path per line in the form; **Fork list** is Default, On or Off
(`list_forks` absent, `true`, `false`). It redraws when a note in `follows/` changes. Needs Obsidian 1.6.6 (`trashFile`). Pure logic in
`src/sources/edit.ts` and `src/sources/follow-note.ts`; vault access in `src/sources/follows.ts`.

- Add: **Name** and **Repo URL or folder**. A repo URL makes a hosted source, an absolute path or
  `file:///` URL a local one. The URL must be valid and not followed already; the name valid and
  free, suggested when empty (`owner-repo`, or the folder's name). Creates `follows/<name>.md`
  with the front matter and an empty body; a file clash is an error, never an overwrite. A local
  source's folder is looked at first (Local sources → Folder kinds), then saved in `localPaths`.
  A hosted repo is not contacted: a wrong URL or branch shows at the first check.
- Edit: rewrites the keys above in the note's front matter (`processFrontMatter`); other keys and
  the body are kept. The name and a hosted URL are read-only (forks record the name; a
  different repo: remove, add). A local source's **Folder** can change: it is this computer's,
  looked at as on add, and saved in `localPaths`. A local source with no folder here is marked,
  and Edit sets one.
- No "open note" button yet: a note opened from settings opens behind the settings window.
- Remove: after confirming, moves the note to the trash (`trashFile`, the user's trash setting),
  and forgets a local source's folder.
  The clone stays under `remotesFolder` (open question).

## State

A cache, per source `url`. Safe to delete. State for a source no longer followed is dropped at the next check.

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
| `fork_remote` | The source's remote name (Source, above) |
| `fork_repo` | Canonical repo URL. Hosted sources only: a local source has none |
| `fork_path` | Repo-relative path of the file forked |
| `fork_branch` | Branch it was forked from |
| `fork_commit` | Head commit SHA at fork time |
| `fork_blob` | Git blob SHA of the file at fork time: the change marker and merge base |
| `fork_date` | ISO datetime of the fork, with offset |

A note is a fork when `fork_path` and `fork_blob` are valid and it has a valid `fork_remote` or
`fork_repo`; the rest are optional when reading. Writing a fork sets these keys and removes any
other `fork_*` key, so a fork of a fork never keeps the upstream's provenance. A fork belongs to
a source by `fork_remote` (names compared without case) when it has one, else by `fork_repo`
(forks made before names). The list of forks is derived by scanning the vault (`intent.md`).

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

Details: a rename counts as in `include` if either path is. A watched path never acknowledged is
`new`; a watched path not at head is reported every check until it leaves `watch`. A fork whose
blob matches head is not listed. A fork is compared with the tracked branch, whatever its
`fork_branch`. Pure logic in `src/check/check.ts`; the vault side in `src/check/run.ts`; the tree in `src/check/file-tree.ts`.

### Check view

**Check sources** (command and ribbon) opens the view in the right sidebar and checks every
source, one at a time. **Open check view** opens it without checking. The last run is kept in
memory only; `checkedAt` is saved for each source checked, and state for sources no longer
followed is dropped.

Per source, a header: its remote name (opens the follow note), branch, and a summary (`New 4 ·
Watched 1 · Forks 2`, "Nothing new" or "Error"). Selecting the header opens or closes the
source. It starts open when it has an error or anything new, closed otherwise; once the user
has opened or closed it, it stays that way until the view is closed, checks included. Under an
open header: the error, or "nothing new", or:

- **What's new**: every changed file, as a folder tree: folders first, each with a count of the
  files under it, then files with their status. A folder holding only one folder is joined
  with it (`wiki/cs/se`). Selecting a folder opens or closes it; what's in a closed folder
  isn't drawn. Folders start open, or closed when every file is listed (first check, history
  rewritten), which comes with the reason; like sources, they stay as the user left them.
- **Watched**: status and path.
- **Forks changed upstream**: the fork note (opens it) and its `fork_path`.
- **Mark as seen**: acknowledges this source. Forks stay listed.
- **Snapshot**: local sources only, in the header, so shown whatever the result and when closed
  (Local sources → Snapshot).

Needs Obsidian 1.7.2 (`revealLeaf` returning a promise).

## Remote host

`RemoteHost` (`src/remote/host.ts`) is all the check and fork steps use. `GitHost`
(`src/remote/git.ts`) implements it with the git CLI, one bare partial clone per source at
`<remotesFolder>/<host>/<owner>/<repo>.git`, or `<remotesFolder>/local/<name>-<hash>.git` for a
local source (`<hash>`: 32-bit FNV-1a of the key, so names that clean up the same don't share a
clone). git fetches a local source from `fileUrl()` of its folder in `localPaths`, and the
clone's origin is set to it before each fetch (`remote set-url`), so a moved folder is followed;
no folder here is a `not-found` error. Commands run without a shell, with
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

## Local sources

A local source is a git repo on this computer. Its follow note says `local: true` and holds no
path: the folder is in `localPaths`, keyed by the remote name, on each computer separately, so
the note can be published and synced without giving away a path. It is checked like any other: cloned into `remotesFolder` and read from its commits, so the check sees only
what is committed. Two actions write to its folder, outside the vault, and only when the user
asks: **making a repo** of a folder that isn't one, and a **snapshot**, which commits what
changed. Both run the user's git with their identity and hooks, one at a time per folder. Pure
logic in `src/remote/local-repo.ts` and `src/remote/snapshot.ts`; the vault side in
`src/snapshot/run.ts`.

### Folder kinds

`inspectLocal()` says what the folder (from `localPaths`) is, from
`rev-parse --is-bare-repository --is-inside-git-dir --show-prefix --git-dir`:

| Kind | When | On add | On Snapshot |
|---|---|---|---|
| `missing` | No such folder | Error, not added | Error |
| `unusable` | Inside a `.git` folder, or below a bare repo's top | Error, not added | Error |
| `not-repo` | No repo, or a subfolder of another repo (`within`) | Asks: **Make repo and add**, **Add without**, or close (not added) | View: asks to make a repo. Command: says to use the view |
| `bare` | A bare repo's top | Added; warns if it has no commits | Error: nothing to commit from |
| `work` | A working repo's top | Added; warns if nothing is committed, or `branch` doesn't exist | Snapshots |

Warnings are notices; the source is still added.

### Making a repo

`initLocal()`: `init --initial-branch <branch>` (git's default when the source has none), a
`.gitignore` unless the folder has one, then a snapshot. The `.gitignore` leaves out a vault's
app data: this vault's `configDir` (taken as the other vault's too), `.trash/`, `.remotes/` and
`.DS_Store`. Within another repo, it makes a separate, nested one. If it fails partway (a
commit hook, no git identity), the error shows and, on add, the source is not added; adding
again finds a repo with nothing committed and warns.

### Snapshot

Commits everything changed in the folder, so the next check sees it. **Snapshot** in the check
view does one source, then checks again if it committed. **Snapshot local sources** (command)
does each local source in turn, and checks again if anything was committed and the view shows a
check. One notice lists each folder's outcome.

`snapshot()` stops with a `bad-input` error when:

1. The folder is not the top of a working repo (`rev-parse --is-inside-work-tree
   --show-prefix`): in a subfolder, `add -A` would stage the whole enclosing repo.
2. HEAD is not on a branch (`symbolic-ref --short HEAD`), or the source has a `branch` and HEAD
   is on another: the source wouldn't see the commit. It never commits to a branch that isn't
   checked out.

Then `status --porcelain -z --untracked-files=all`: empty, nothing to do. Otherwise `add -A`
(`.gitignore` respected) and, if the index then differs from HEAD (`diff --cached --name-only`),
`commit -m "Snapshot <local ISO time>"`. A failing commit is a `git` error and leaves the
changes staged.

## Fork

Two ways in: **Fork** after a file in the check view's What's new or Watched (at the head that
check saw), or **Fork a file from a source** (pick a source, skipped when there is one; its head
is fetched; pick a file). Markdown files only: front matter is where the provenance goes.

A modal offers the vault path `<folder>/<file name>`. The folder is, in order: the source's
`folder`; the remote file's folder, if `matchFolders` is on and the vault has that exact folder
(a partial match doesn't count, and no folder is created for it); else `forkFolder`. The modal
says which. If that path is taken, it offers `<name> 1.md`, `<name> 2.md`, … and says why; if
the file was forked before, it names those notes. The path can be edited (`.md` is added); an
existing note is never overwritten. On **Fork**: the blob is fetched, the note created with the
remote text, then the provenance keys added (`processFrontMatter`: remote keys kept, `fork_*`
added or overwritten). Remote front matter that isn't valid YAML is refused before anything is
written. `fork_date` is local time with its offset. The new note opens.

Pure logic in `src/fork/fork.ts`; the vault side in `src/fork/run.ts`.

## Fork list

A follow note keeps a fork list when its `list_forks` is `true`, or when it has no `list_forks`
and the `listForks` setting is on. The list is links to the notes forked from its source, at the
end of the note:

```markdown
## Forked pages

- [human computation](../wiki/human%20computation.md)
```

The plugin owns the section: from the `## Forked pages` line to the next `#` or `##` heading, or the
end of the note. Text in it is replaced, so `###` headings there go too; text outside it is never
touched. Links are made by Obsidian (`generateMarkdownLink`), so they follow the vault's link
settings, sorted. A source with no forks has no section: it is added at the end with the first
fork and removed with the last. A note with the heading more than once is left alone, with a
notice.

Updated, debounced, after a fork note is created, renamed, deleted or has its `fork_*` keys
changed, after a follow note changes, and when the setting is turned on; not before the
workspace is ready, so a half-loaded metadata cache can't empty a list. A note is written only if
its list changed. A note that stops keeping a list (the setting off, or `list_forks: false`) is
left as it is. **Update fork lists in follow notes** (`update-fork-lists`) syncs every follow note
now except those with `list_forks: false`, whatever the setting. Pure logic in
`src/fork/fork-list.ts`; the vault side in `src/fork/fork-lists.ts`.

## Build order

1. Done. Schema: data types, `normalizeData`, canonical URL, fork provenance read/write. Pure, tested.
2. Done. Git host: head, tree, changes, blob over the git CLI. Tested against real git and
   temporary repos.
3. Sources settings: add, edit, remove. Done.
4. Check view: what's new, watched, forks. Done.
5. Fork: check view and command, folder matching, fork list. Done.
6. Local sources: snapshot, making a repo, folder checks on add. Done.
7. Remote names: the note's name is the remote's, `fork_remote`, local folders in `localPaths`. Done.
8. Later: update a fork (`git merge-file` on `fork_blob`), propose upstream, tag filters.
