# PublicTxt Remotes — Spec

What the plugin does. Why in `intent.md`, names in `naming.md`. Draft: nothing released.

## Data

`data.json` holds `{ version, communityFolder, forkFolder, matchFolders, listMirrors, listForks, clonesFolder, gitPath, state, localPaths }`. Sources are notes (below).

| Field | Default | Meaning |
|---|---|---|
| `communityFolder` | `community` | **Community folder**: vault folder holding each source's folder of mirrors (Mirror, below; `''`: the vault root). publictxt-pages names the same folder in its settings, set by hand |
| `forkFolder` | `''` | **Fork folder**: where forks go when they don't go to the folder they are in in the source (`''`: the vault root). Never under the community folder by default: a fork is the user's note |
| `matchFolders` | `true` | The fork modal opens with **Folders** set to **Same folder as in the source** when the vault has that exact folder (Fork, below). The user can change it at each fork |
| `listMirrors` | `false` | Keep a mirror list in each follow note (Mirror and fork lists, below) |
| `listForks` | `false` | Keep a fork list in each follow note (Mirror and fork lists, below) |
| `clonesFolder` | `.clones` | **Clones folder**: vault folder holding the clones; never empty. Hidden, so Obsidian doesn't index it and Sync skips it |
| `gitPath` | `git` | The git executable. Set it when Obsidian doesn't see the shell's PATH (macOS apps started from Finder) |
| `localPaths` | `{}` | Remote name → absolute folder of each local source on this computer (Local sources, below). Never in a note |

## Source

A repo the user follows, hosted or on this computer (Local sources, below): a note in the
top-level `follows/` (any depth), one per repo
(publictext ADR-0014, spec §3.2). The list of sources is derived by scanning that folder, never
stored. The note's body is the user's own prose; the plugin only touches its front matter, and
its mirror and fork lists when it keeps them (Mirror and fork lists, below).

The note's file name, without `.md`, is the source's **remote name**: `follows/research.md` is the
remote `research`. Mirrors and forks record it (`mirror_remote`, `fork_remote`). A name can't start with `.` or a space, or
contain `\ / : * ? " < > | # ^ [ ]`; names are unique, compared without case.

| Key | Type | Rule |
|---|---|---|
| `url` | string | A hosted source's canonical repo URL (below). Required unless `local` |
| `local` | `true` | Plugin only. A local source: no `url`; its folder is in `localPaths`, never in the note |
| `branch` | string | Branch to track. Absent or blank: the remote's default branch |
| `include` | string or list | Folder prefixes ending in `/`, repo-relative. Empty: the whole repo. Narrows "what's new" only |
| `folder` | string | Plugin only. Folder for this source's mirrors, under `communityFolder`. Absent: the remote name |
| `list_mirrors` | boolean | Plugin only. Keep this note's mirror list (`true`) or not (`false`). Absent, or not a boolean: the `listMirrors` setting |
| `list_forks` | boolean | Plugin only. Keep this note's fork list (`true`) or not (`false`). Absent, or not a boolean: the `listForks` setting |

`url`, `branch` and `include` are the spec's; `local`, `folder`, `list_mirrors` and `list_forks` are this
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
here, or that it has none; branch, include, the folder its mirrors go to (`mirrors to:
community/txt`), mirror list and fork list when set, note
path), any duplicate or invalid notes, and **Add source**. **Community folder** and **Fork
folder** here, and **Mirror folder** in the form, offer the vault's folders as the user types. Lists are one path per line in the form; **Mirror list** and **Fork list** are each Default, On or Off
(`list_mirrors`, `list_forks`: absent, `true`, `false`). It redraws when a note in `follows/` changes. Needs Obsidian 1.6.6 (`trashFile`). Pure logic in
`src/sources/edit.ts` and `src/sources/follow-note.ts`; vault access in `src/sources/follows.ts`.

- Add: **Name** and **Repo URL or folder**. A repo URL makes a hosted source, an absolute path or
  `file:///` URL a local one. The URL must be valid and not followed already; the name valid and
  free, suggested when empty (`owner-repo`, or the folder's name). Creates `follows/<name>.md`
  with the front matter and an empty body; a file clash is an error, never an overwrite. A local
  source's folder is looked at first (Local sources → Folder kinds), then saved in `localPaths`.
  A hosted repo is not contacted: a wrong URL or branch shows at the first check.
- Edit: rewrites the keys above in the note's front matter (`processFrontMatter`); other keys and
  the body are kept. The name and a hosted URL are read-only (mirrors and forks record the name; a
  different repo: remove, add). A local source's **Folder** can change: it is this computer's,
  looked at as on add, and saved in `localPaths`. A local source with no folder here is marked,
  and Edit sets one.
- No "open note" button yet: a note opened from settings opens behind the settings window.
- Remove: after confirming, moves the note to the trash (`trashFile`, the user's trash setting),
  and forgets a local source's folder. Its mirrors and forks stay in the vault.
  The clone stays under `clonesFolder` (open question).

## State

A cache, per source `url`. Safe to delete. State for a source no longer followed is dropped at the next check.

| Field | Meaning |
|---|---|
| `seenCommit` | Head commit at the last check the user acknowledged. `null`: never checked |
| `checkedAt` | ISO datetime of the last check |

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
| `fork_seen` | The upstream blob the user last dealt with without taking it, or `gone` for a file removed upstream (Fork update, below). Absent until then |

A note is a fork when `fork_path` and `fork_blob` are valid and it has a valid `fork_remote` or
`fork_repo`; the rest are optional when reading. Writing a fork sets these keys and removes any
other `fork_*` key and every `mirror_*` key, so a fork of a fork never keeps the upstream's
provenance, and a mirror that is forked stops being one. A fork belongs to
a source by `fork_remote` (names compared without case) when it has one, else by `fork_repo`
(forks made before names). The list of forks is derived by scanning the vault (`intent.md`).

## Mirror provenance (front matter)

A mirror is upstream's copy of a page, kept in the vault to read, search and link to (Mirror,
below). It carries the same provenance as a fork, under its own keys, so a note says which it
is wherever it is, published included:

`mirror_remote`, `mirror_repo`, `mirror_path`, `mirror_branch`, `mirror_commit`, `mirror_blob`,
`mirror_date`: as their `fork_*` namesakes, for the version the mirror holds. No `mirror_seen`:
an update overwrites a mirror, so there is nothing to have seen.

A note is a mirror when `mirror_path` and `mirror_blob` are valid, it has a valid
`mirror_remote` or `mirror_repo`, and it is not a fork: valid `fork_*` keys win. Writing a
mirror removes every `fork_*` key. A mirror belongs to a source as a fork does. What it is
goes by its keys, not its folder: a mirror moved by hand is still a mirror. The list of
mirrors is derived by scanning the vault.

## Check

Per source, against the tracked branch's head:

1. Fetch, then read the head commit and the recursive tree (`path → blob SHA`).
2. **What's new**: files changed between `seenCommit` and head, within `include`. If
   `seenCommit` is null, or `changes` is `null` (history rewritten): list every file in
   `include` as new, and say why.
3. **Mirrors**: each upstream file with a mirror of this source whose `mirror_blob` isn't the
   blob at head, or that is gone. A file mirrored more than once (a mirror copied by hand)
   lists the mirrors that aren't current.
4. **Forks**: each upstream file with forks of this source that aren't all settled for it. The
   forks with one `fork_path` are that file's **copies**. A copy is **settled** for the blob at
   head when its `fork_blob` or its `fork_seen` is that blob; for a file that is gone, when its
   `fork_seen` is `gone`.

Acknowledging moves `seenCommit` forward. Mirrors and forks are dealt with one upstream file
at a time (Mirror, Fork update, below), since their state is their front matter.

Details: a rename counts as in `include` if either path is. A mirror is listed whether or not
its file is within `include`, until it is updated, forked or removed. A fork whose
blob matches head is not listed. A fork is compared with the tracked branch, whatever its
`fork_branch`. A file's copies are listed latest first: by `fork_date`, newest first; one
without a valid date after any with; ties by path, in byte order. A file that is back after
`fork_seen: gone` is listed again if its blob differs from `fork_blob`. Pure logic in `src/check/check.ts`; the vault side in `src/check/run.ts`; the tree in `src/check/file-tree.ts`.

### Check view

**Check sources** (command and ribbon) opens the view in the right sidebar and checks every
source, one at a time. **Open check view** opens it without checking. The last run is kept in
memory only; `checkedAt` is saved for each source checked, and state for sources no longer
followed is dropped. The state saved is built from the state when the run ends, so a source
acknowledged while it ran stays acknowledged. A check asked for as Obsidian starts waits for the
workspace to be ready, so a half-loaded metadata cache can't make sources look unfollowed.

Per source, a header: its remote name (opens the follow note), branch, and a summary (`New 4 ·
Mirrors 1 · Forks 2`, "Nothing new" or "Error"). Selecting the header opens or closes the
source. It starts open when it has an error or anything new, closed otherwise; once the user
has opened or closed it, it stays that way until the view is closed, checks included. Under an
open header: the error; or "nothing new" when there is nothing to list; then the actions and
the lists:

- **Mark as seen**: acknowledges this source. Mirrors and forks stay listed. Shown when there
  is something to acknowledge.
- **Browse all files** / **Hide all files**: shows or hides All files, below. Always shown.
- **Update mirrors (n)**: shown when mirrors changed upstream (Mirror, below).
- **Mirror selected (n)** and **Fork selected (n)**: shown when files are ticked (Mirror, Fork,
  below).

- **What's new**: every changed file, as a folder tree: folders first, each with a count of the
  files under it, then files with their status. A folder holding only one folder is joined
  with it (`wiki/cs/se`). Selecting a folder opens or closes it; what's in a closed folder
  isn't drawn. Folders start open, or closed when every file is listed (first check, history
  rewritten), which comes with the reason; like sources, they stay as the user left them.
- A file that can be mirrored or forked (Markdown, not removed), in either list, has a tick
  box, **Mirror** and **Fork**. One already mirrored has the word "mirrored" (opens the mirror)
  and **Stop** in place of **Mirror**; its **Fork** moves the mirror (Fork, below). A folder
  holding any has a tick box for them all: ticked, half ticked or clear;
  selecting it ticks them all, or clears them if all were ticked. Ticks stay like what's open;
  one whose file a later check doesn't list isn't counted. A file the user has already forked
  also has **Compare** (as under Forks changed upstream) while its copies aren't settled, else
  the word "forked"; it keeps its own tick box and **Fork**, but a folder's tick box leaves it
  out, so ticking a folder never forks it again.
- **Mirrors changed upstream**: a row per upstream file (its `mirror_path`), then a row per
  mirror that isn't current (opens the note). A changed file has **Update**. A file gone
  upstream has **Remove** and **Fork** (Mirror, below).
- **Forks changed upstream**: a row per upstream file (its `fork_path`), then a row per copy,
  latest first (opens the note; with several, the first says "latest"). A changed file has
  **Compare**, for the latest copy. A file gone upstream has **Detach** and **Keep** (Fork
  update, below).
- **All files (n)**: last, while browsing. Every file at the head the check saw, within
  `include`, whatever has been seen: the way back to files after **Mark as seen**. A folder
  tree as in What's new, with no status; folders start closed and stay as the user left them,
  apart from What's new's. Tick boxes, **Mirror**, "mirrored", **Stop**, **Fork**, **Compare** and "forked" as in What's new; a
  tick is one tick per file, whichever list it was made in. Browsing changes no state, and
  stays on across checks until the view is closed.
- **Snapshot**: local sources only, in the header, so shown whatever the result and when closed
  (Local sources → Snapshot).

Needs Obsidian 1.14.4: the API the plugin is built and linted against.

## Remote host

`RemoteHost` (`src/remote/host.ts`) is all the check and fork steps use. `GitHost`
(`src/remote/git.ts`) implements it with the git CLI, one bare partial clone per source at
`<clonesFolder>/<host>/<owner>/<repo>.git`, or `<clonesFolder>/local/<name>-<hash>.git` for a
local source (`<hash>`: 32-bit FNV-1a of the key, so names that clean up the same don't share a
clone). git fetches a local source from `fileUrl()` of its folder in `localPaths`, and the
clone's origin is set to it before each fetch (`remote set-url`), so a moved folder is followed;
no folder here is a `not-found` error. Every command in a clone runs as that repo alone
(`--git-dir=.`): git in a folder that isn't one would otherwise look up the tree and act on the
vault's own repo. A clone folder that is there but isn't a bare repo (say, emptied by a
`reset` of a vault that had committed `.clones/`) is a `git` error saying to delete it; it is
cloned anew at the next check. Before each clone or fetch, the cache folder gets a `.gitignore`
of `*` unless it has one, so the clones never show in a repo the vault is in, whatever commits
it: the plugin, another plugin, or the user. Commands run without a shell, with
`GIT_TERMINAL_PROMPT=0`, one at a time per clone: every host the plugin makes shares the
queues, so a check, a fork and a compare take turns. A command still running after five minutes
is stopped, and fails as a `git` error.

| Method | git |
|---|---|
| (first use) | `clone --bare --filter=blob:none`, then `remote.origin.fetch = +refs/heads/*:refs/heads/*` |
| `head` | When `branch` is null, `ls-remote --symref origin HEAD` for the default branch and its commit; `fetch --prune`, unless that commit is the clone's already; `rev-parse` the commit and tree |
| `tree` | `ls-tree -r -z`, blobs only (submodules skipped) |
| `changes` | `null` if `base` is unknown or not an ancestor (`cat-file -e`, `merge-base --is-ancestor`); else `diff --name-status -z -M` |
| `blob` | `cat-file blob`; a partial clone fetches it on demand |
| `prefetch` | Several blobs in one `fetch`, before forking several files; failing is no error, as `blob` fetches each on demand |
| `diffStat` | Lines added and removed between two blobs: `diff --numstat <from> <to>`. `null` when git fails (a blob gone upstream can't be fetched) or the diff is binary |

Errors are a `RemoteError` by `kind`: `no-git` (git can't start), `git` (a command failed),
`not-found` (branch or default branch missing), `bad-input` (not a canonical URL or SHA).

## Local sources

A local source is a git repo on this computer. Its follow note says `local: true` and holds no
path: the folder is in `localPaths`, keyed by the remote name, on each computer separately, so
the note can be published and synced without giving away a path. It is checked like any other: cloned into `clonesFolder` and read from its commits, so the check sees only
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
app data: this vault's `configDir` (taken as the other vault's too), `.trash/`, `.clones/` and
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

## Mirror

Taking notes from a source is three steps, so that reading its pages and owning a copy are
apart: follow the repo (Source), **mirror** the pages worth keeping at hand, **fork** the ones
to make one's own (Fork, below).

A mirror is upstream's copy, in the vault: Obsidian searches it, shows its backlinks and
graph, and opens it in place. Its links are left as upstream wrote them; they mostly work,
since a source's mirrors keep its layout. It is not for editing: an update overwrites it.

**Where.** `<communityFolder>/<folder or remote name>/<path upstream>` (`mirrorFolderOf()`,
`mirrorPath()`): `wiki/cs/git.md` from `txt` is mirrored at `community/txt/wiki/cs/git.md`.
Nothing is asked: where a mirror goes is not a choice. Upstream's pages live under the
community folder, the user's wherever they put them.

**Mirror.** Three ways in: **Mirror** after a file in the check view's What's new or All files
(at the head that check saw); **Mirror selected** there, for the ticked files, which then
clears the ticks; or **Mirror a file from a source** (pick a source, skipped when there is
one; its head is fetched; pick a file). Markdown files only. Per file (`planMirrors()`):

- Already mirrored, wherever its mirror is: left alone.
- Its place is taken by something that isn't its mirror: not written, and reported.
- Otherwise the blob is fetched, the note created with upstream's text, and the `mirror_*`
  keys added. Upstream front matter that isn't valid YAML is refused before anything is
  written.

One notice says how it went; with failures it stays until dismissed. The note is not opened:
the file's row now says "mirrored", which opens it.

**Update.** A check lists the mirrors that aren't what is at head (Check, above). **Update**
on a file's row, or **Update mirrors (n)** for all of them, overwrites each with upstream's
text at the head the check saw and rewrites its `mirror_*` keys. No compare: the copy is
upstream's. A mirror that was edited (its text differs from the version it mirrors, its
`mirror_*` keys aside, as for a fork; or that version can't be read) is not overwritten
unasked: **Update** asks first, and says to fork it to keep the edits; **Update mirrors**
leaves it and names it. Updating never happens during a check: a check writes nothing into
notes.

**Stop.** **Stop** on a mirrored file's row, **Remove** on a mirror gone upstream, or **Stop
mirroring this note** (command, on the active note): after confirming, the mirror moves to
the trash. Nothing of the user's is lost: the text is upstream's. A mirror gone upstream
stays listed until it is removed or forked.

Mirrors have their own list in the follow note (Mirror and fork lists, below). They don't
count in Convert links: a mirror's links are upstream's.

Pure logic in `src/mirror/mirror.ts`; the vault side in `src/mirror/run.ts`.

## Fork

A fork is the user's own note, made from an upstream page: they edit it, and upstream's
changes come through Compare (Fork update, below).

Four ways in: **Fork** after a file in the check view's What's new, All files or a mirror gone
upstream (at the head that check saw); **Fork selected** there, for the ticked files; **Fork a
file from a source** (pick a source, skipped when there is one; its head is fetched; pick a
file); or **Fork this mirror** (command, on the active note; nothing is fetched). Markdown
files only: front matter is where the provenance goes.

**A mirrored file is moved, not fetched.** Its mirror moves to where the fork goes
(`renameFile`, so Obsidian updates the links to it) and its `mirror_*` keys become `fork_*`,
with `fork_date` now. Its text stays as it is: the version it mirrored (`fork_blob`), and
anything edited in it; if upstream has moved on since, the next check lists it under Forks.
Moved, never copied: two notes of one name would split every link by name. The modal says so,
and its mirror's own path doesn't count as taken. A file that isn't mirrored is fetched at
head and written, as below.

All of them open one modal, for one file or several. Where the forks go is two choices:

- **Folders**, how the source's folders come over:
  - **Into the folder**: every file goes into the one **Folder**, under its own name.
  - **Into the folder, keeping source folders**: each file goes into **Folder**, under the
    folder it is in in the source: `wiki/cs/git.md` with folder `notes/research` goes to
    `notes/research/wiki/cs/git.md`. A file at the top of the source goes into **Folder**.
  - **Same folder as in the source**: each file goes to the folder it is in in the source, at
    the same path in the vault; a file at the top of the source goes to the vault root.

  Missing folders are created, whether or not the vault has them. Fixed at **Into the
  folder** when no file has a folder in the source.
- **Folder**: used by the first two. Empty is the vault root; a folder that doesn't exist is
  created. The field offers the vault's folders as the user types, at most 50, and stays free
  text. Slashes at its ends are dropped; a `.` or `..` part, or a path that is a file, is an
  error.

The modal opens as follows, and says which rule filled in the folder until the user edits it:

| Case | Folders | Folder |
|---|---|---|
| `matchFolders` is on, and every file has a folder in the source that the vault has exactly | Same folder as in the source | the fork folder (`forkFolder`) |
| Otherwise | Into the folder | the fork folder |

A fork never opens under the community folder: that is where upstream's copies are. The user
can still type any folder.

A partial match doesn't count, and nothing is created for a match: the user picks **Same
folder as in the source** for that. The folder typed is kept while that is picked, and comes
back with another choice.

For **one file** there is also its **Name**, without `.md`: the source file's name, or the
first free `<name> 1`, `<name> 2`, … when that is taken in the destination, with a note saying
so. The suggestion follows the destination until the user types a name; then it is theirs,
and must be free. Empty, or with `/` or `\`, is an error. If the file was forked before, the
modal names those notes.

Above the buttons the modal shows what would be written, redrawn on each change: for one file
"Goes to `<path>`"; for several, a row per file (`source path → vault path`, "Name taken." when
numbered, in the vault or by an earlier row, compared without case; "Forked before."; "Its
mirror moves."). Both
list the folders that would be made. An error takes its place and disables **Fork** / **Fork
all**. Enter in a text field forks; an existing note is never overwritten.

On **Fork**, per file that isn't mirrored: the blob is fetched, the note created with the remote text, then the
provenance keys added (`processFrontMatter`: remote keys kept, `fork_*` added or overwritten).
Remote front matter that isn't valid YAML is refused before anything is written. `fork_date`
is local time with its offset.

- One file: a notice, and the new note opens. A failure shows in the modal, which stays open.
- Several: each is forked in turn, going on past one that fails. One notice says how many were
  forked, and lists those that weren't with why; that one stays until dismissed. No note is
  opened.

After **Fork selected**, the ticks are cleared.

Once the forks are written, the plugin may offer to convert links (→ Convert links).

Pure logic in `src/fork/destination.ts` (where forks go) and `src/fork/fork.ts` (and
`src/check/selection.ts` for the ticks); the vault side in `src/fork/run.ts`; the modal in
`src/ui/fork-modal.ts` and `src/ui/fork-preview.ts`; the folder list in
`src/ui/folder-suggest.ts`.

## Fork update

For a fork whose upstream file changed: look at the new version beside the note, then take it,
keep a copy of it, or wave it off. No merge.

**Compare** (check view), or the command **Compare this fork with upstream** on the active
note, opens two panes: the note, and to its right the **Upstream** view (`publictxt-upstream`)
with the file as it is at head, read-only. The check view compares the latest copy, at the head
the check saw. The command reads the source's head itself, and compares unless the note's
`fork_blob` is already the blob at head ("Nothing new upstream."): a version the note has only
seen is still compared. One Upstream pane is reused.

The view's header says the source, the branch and the note it is beside, then:

- **What changed**: "12 lines added, 3 removed since you forked." (`diffStat` from `fork_blob`
  to the blob at head), or "Can't tell what changed: the version you forked is gone upstream."
- **Whether the copy is edited** since it was forked, kept current as the note is saved: "Your
  copy is edited." / "Your copy is as you forked it." / "Can't tell whether your copy is
  edited." (the forked blob can't be read). Edited: the body differs from the forked version's
  (blank lines at its start, the kind of line ending, and links written differently but
  showing the same words aside: converted links are no edit), or the front matter does,
  parsed and without the `fork_*` keys. Parsed, because Obsidian rewrites the YAML when it adds
  the keys.

Below, the upstream file rendered as Markdown, without its front matter. **Show source**
switches to its whole text, and back.

| Action | The compared copy | The file's other copies |
|---|---|---|
| **Overwrite** | Text replaced by upstream's; `fork_branch`, `fork_commit`, `fork_blob` and `fork_date` rewritten for it; `fork_seen` removed | `fork_seen` set to the blob |
| **Write alongside** | `fork_seen` set | `fork_seen` set |
| **Keep mine** | `fork_seen` set | `fork_seen` set |

Each ends with every copy settled, so the file leaves the check view, and the Upstream pane
closes. A copy already settled is not written to.

- **Overwrite** asks first when the copy is edited or that can't be told, checked at that
  moment. The note keeps its name and path. Upstream front matter that isn't valid YAML is
  refused; if the provenance can't be written, the note is put back as it was.
- **Write alongside** writes upstream as a new fork (`writeFork()`), in the copy's folder: the
  copy's name with any ` (up-nn)` ending dropped, then ` (up-01)`, ` (up-02)`, … the first that
  is free. It opens where the copy was, and is now the latest copy.
- **Keep mine** changes no text.

Nothing is overwritten except by **Overwrite**, on the one note it names. After **Overwrite**
and **Write alongside**, the plugin may offer to convert links (→ Convert links).

A file gone upstream has nothing to compare. **Detach** removes the `fork_*` keys from every
copy, after asking; the notes stay. **Keep** sets `fork_seen: gone` on every copy: they stay
forks and aren't listed until the file is back and differs.

The view's state is the source key, the upstream path, blob, branch and commit, and the note's
path, so it comes back after a restart, reading the blob from the clone. If the note is gone, no
longer a fork of that file, or its source isn't followed, the view says so and offers nothing.

Pure logic in `src/fork/update.ts` (and `isSettled()`, `latestFirst()` in `src/check/check.ts`);
the vault side in `src/fork/update-run.ts` and `src/fork/compare-run.ts`; the view in
`src/ui/upstream-view.ts`.

## Mirror and fork lists

A follow note can end with two lists, each with its own switch: links to the notes mirrored
from its source, and links to the notes forked from it.

| List | Heading | Kept when |
|---|---|---|
| Mirror list | `## Mirrored pages` | the note's `list_mirrors` is `true`, or it has none and the `listMirrors` setting is on |
| Fork list | `## Forked pages` | the note's `list_forks` is `true`, or it has none and the `listForks` setting is on |

```markdown
## Mirrored pages

- [git](../community/txt/wiki/cs/git.md)

## Forked pages

- [human computation](../wiki/human%20computation.md)
```

The plugin owns each section: from its heading line to the next `#` or `##` heading, or the
end of the note. Text in it is replaced, so `###` headings there go too; text outside it is never
touched. Links are made by Obsidian (`generateMarkdownLink`), so they follow the vault's link
settings, sorted. A list with nothing in it has no section: it is added at the end of the note
with the first mirror or fork and removed with the last. Written together, the mirror list
comes first; a section added later goes at the end, wherever the other is. A heading that
appears more than once is left alone, with a notice; the other list is still written.

A mirror that is forked leaves the mirror list and joins the fork list, in one write.

Updated, debounced, after a mirror or a fork is created, renamed, deleted, changes kind, or
changes the source it is from (its remote name or repo; its text and other keys are in no
list), after a follow note changes, and when either setting is turned on; not before the
workspace is ready, so a half-loaded metadata cache can't empty a list. A note is written only if
a list it keeps changed. A list a note stops keeping (its setting off, or its key `false`) is
left as it is. **Update mirror and fork lists in follow notes** (`update-page-lists`) syncs
every follow note now, each list except those turned off in the note (`list_mirrors: false`,
`list_forks: false`), whatever the settings. Pure logic in
`src/fork/fork-list.ts`; the vault side in `src/fork/fork-lists.ts`.

## Convert links

A fork's links were written for upstream: relative to where the file sat there, in upstream's
link style. Converting points them at the vault's copies, in the vault's style. Sources are
Obsidian vaults or plain Markdown repos: `[[wikilinks]]` and `[text](path)` links.

**Which links.** Those Obsidian finds in a fork's body (`links` and `embeds` in the metadata
cache), so links in code, front matter and web links are never touched.

**What a link means.** Read as upstream reads it, against the source's files at the fork's
`fork_commit` (`ls-tree` in the clone; no fetch; the paths of the source's forks stand in when
the commit is gone). A Markdown link is tried relative to the note, then from the root, then
by name; a wikilink from the root, then relative, then by name. `./` and `../` are relative
only, `/` from the root only; `.md` is added when missing; a case-insensitive match only when
there is no exact one.

**What it becomes:**

| The link names upstream | Becomes |
|---|---|
| A file with a copy in the vault (the latest, by `fork_path`) | A link to that copy, as Obsidian writes it (`generateMarkdownLink`) |
| A file already linked to one of its copies here | Left on that copy |
| The note itself | A link to the note |
| A note with no copy | A link by name in the vault's style: the shortest end of its path that upstream reads back as it (`b`, `cs/b`), so it converts to the copy once forked |
| No file, or several by name | A link by its own name in the vault's style |

A link by name lands on the vault's note of that name, or dangles: the wiki way. One already in
the vault's style and by name stays. The `#heading` or `#^block`, the words a link shows (an
alias only when needed) and embeds are kept. The vault's style is read by asking Obsidian for
a link to a note: its setting isn't public API.

**Left as they are**, with why: **not a note** (an image or other file), **no name fits** (no
link by name reads back as the note: rare, in Markdown-link vaults), **cannot be converted** (a
name a link can't hold, `| # ^ [ ]`, or words that can't be its text).

**When.** **Convert links in this fork** (`convert-links`) converts the active fork;
**Convert links in every fork** (`convert-links-all`) every fork of every followed source.
After a fork, **Overwrite** or **Write alongside**, the plugin counts, without writing, what
would convert in every fork of that source (forking `b` makes links to `b` convertible in
notes forked earlier). If any would, a notice offers **Convert**; it stays until used or
dismissed. It waits up to 2 seconds for Obsidian to read the new notes, else there is no
offer. Never automatic. A notice says what was converted, how many to notes not in the vault,
what was left and what to check.

A note is written once (`vault.process`), only if a link changed, and not at all when the
cache no longer matches its text ("Changed while converting, try again"). `fork_*` keys are not
touched: `fork_blob` stays what the text came from, so the compare still works.

**The report.** Each conversion that writes rewrites two sections in the follow note of each
source it covered, from every fork of that source (**Convert links in this fork** too). They
are owned like **Forked pages**, written with it in one pass, and removed when empty:

```markdown
## Links to fix

Links in forks of this source that converting left as they were. Rewritten each time links are converted.

- [[a]] line 3: `![p](../img/p.png)` not a note

## Links to check

Links in forks of this source that converting made a call on: they may not go where upstream meant. Rewritten each time links are converted.

- [[a]] line 5: `[[dup]]` several by name
- [[z]] line 2: `[[x]]` kept on your copy
```

To check: **several by name** (the name is several files upstream, so the link went by name)
and **kept on your copy** (the link pointed at a copy and upstream reads it as another file).
They stay listed until the link is given a path by hand. Case-only matches and links by name
to notes not in the vault are not listed.

Pure logic in `src/fork/links.ts` and `src/fork/link-report.ts`; the vault side in
`src/fork/links-run.ts`. The design and its reasons: `docs/plans/convert-links.md`.

## Build order

1. Done. Schema: data types, `normalizeData`, canonical URL, fork provenance read/write. Pure, tested.
2. Done. Git host: head, tree, changes, blob over the git CLI. Tested against real git and
   temporary repos.
3. Sources settings: add, edit, remove. Done.
4. Check view: what's new, watched, forks. Done. (Watched went when mirrors came: a mirror is a watched file the vault also holds.)
5. Fork: check view and command, folder matching, fork list. Done.
6. Local sources: snapshot, making a repo, folder checks on add. Done.
7. Remote names: the note's name is the remote's, `fork_remote`, local folders in `localPaths`. Done.
8. Fork update: compare with upstream, overwrite, write alongside, keep; `fork_seen`. Done.
9. Convert links: to the vault's copies, in its style; the offer after forking; the report. Done.
10. Mirror: upstream's copies under the community folder, updated by overwriting; a fork moves its mirror; watch removed. Done.
11. Later: merge a fork (`git merge-file` on `fork_blob`), propose upstream, tag filters.
