# PublicTxt Remotes — Naming

Names used in code, docs and UI. Nothing is released, so all of it can still change; plugin id
and command ids freeze at the first release.

## Plugin identity

| Thing | Name | Notes |
|---|---|---|
| Repo | `publictxt/obsidian-publictxt-remotes` | Renamed from `obsidian-publictxt` (2026-11-10) |
| Plugin `id` | `publictxt-remotes` | Freezes at the first release. Remotes: repos and vaults elsewhere; a local source is the special case |
| Display `name` | PublicTxt Remotes | |
| View types | `publictxt-check`, `publictxt-upstream` | Freeze at the first release |
| Command ids | `check-sources`, `open-check-view`, `mirror-file`, `stop-mirroring`, `fork-mirror`, `fork-file`, `compare-fork`, `convert-links`, `convert-links-all`, `snapshot-local-sources`, `update-fork-lists` | Freeze at the first release |

## Vocabulary

| Word | Means |
|---|---|
| source | A repo the user follows, hosted or local: a follow note in `follows/` (publictext spec §3.2) |
| follow note | The note that is a source; front matter holds its fields, the body the user's prose |
| include | Folder prefixes narrowing a source's "what's new" |
| follow | To subscribe to a repo: add it as a source. Only repos are followed; pages are mirrored |
| mirror | Upstream's copy of a source file, in the vault under the community folder, carrying `mirror_*` provenance. Kept current by overwriting; not for editing. Also the action |
| fork | The user's own note made from a source file, carrying `fork_*` provenance. Forking a mirrored file moves its mirror |
| copy | One of the notes forked from the same upstream file. A note written alongside is a copy |
| latest | The copy with the newest `fork_date`: the one the check view compares |
| settled | A copy that needs nothing done about an upstream version: its text came from it, or it has seen it (`fork_seen`) |
| compare | A fork note with the Upstream view beside it |
| community folder | The vault folder holding each source's folder of mirrors (`communityFolder`, `community`). Named for readers: it is a section of the published site |
| mirror folder | A source's folder under the community folder: its `folder`, else its remote name |
| fork folder | Where forks go when not to the folder they are in in the source (`forkFolder`, the vault root) |
| clones folder | The hidden folder of git clones (`clonesFolder`, `.clones`) |
| remote | The technical word for a source: the plugin's name, the remote name, `fork_remote`, `mirror_remote`. Not a folder |
| fork list | The "Forked pages" section the plugin keeps in a follow note |
| convert links | Point a fork's links at the vault's copies, in the vault's link style |
| link by name | A link with no path, `[[b]]` or `[b](b.md)`: lands on the vault's note of that name, or dangles |
| links to fix | The follow note section listing links converting left as they were, and why |
| links to check | The follow note section listing links converting made a call on |
| check | One pass over the sources: what's new, mirrors, forks |
| head | The tracked branch's latest commit |
| blob | A file's git blob SHA |
| clone | A source's bare partial clone under `clonesFolder`. Never a copy of a page: that is a mirror |
| remote name | A source's name: its follow note's file name. Mirrors and forks record it (`mirror_remote`, `fork_remote`) |
| source key | `Source.url`: the canonical URL, or `local:<name>` for a local source |
| local source | A source on this computer: `local: true` in its note, its folder in `localPaths`; "local repo" in code |
| snapshot | A commit of everything changed in a local source's folder, made only if something changed |
| make a repo | `git init` a local source's folder, with a `.gitignore`, then snapshot it |

## Code identifiers

| Name | What |
|---|---|
| `PublicTxtData` | Everything in `data.json`: `{ version, communityFolder, forkFolder, matchFolders, listForks, clonesFolder, gitPath, state, localPaths }` |
| `Source` | One followed repo, read from its follow note |
| `FOLLOWS_FOLDER` | `follows` |
| `readFollow()` / `followProps()` | Front matter ↔ `Source` |
| `collectFollows()` | Follow notes → sources, duplicates and invalid notes |
| `SourceState` | Per-source cache |
| `ForkMeta` | A fork's provenance, read from or written to front matter |
| `MirrorMeta` / `Mirror` | A mirror's provenance (a `ForkMeta` without `seen`) / a mirror note and its provenance |
| `canonicalRepoUrl()` | v0 canonical repo URL (`https:`), or `null` |
| `normalizeData()` | Anything loaded → valid `PublicTxtData` |
| `readForkMeta()` / `forkMetaProps()` | Front matter ↔ `ForkMeta` |
| `readMirrorMeta()` / `mirrorMetaProps()` / `writeMirrorMeta()` | Front matter ↔ `MirrorMeta`. A note with valid `fork_*` keys is a fork, not a mirror |
| `PROVENANCE_KEYS` / `clearProvenance()` | Every `fork_*` and `mirror_*` key / removes them all: writing one kind clears the other |
| `scanForks()` / `scanMirrors()` | Every fork / mirror note in the vault, from the metadata cache |
| `SourceForm` | The source form's raw text; lists one path per line |
| `checkAdd()` / `checkUpdate()` | Form → the source to write, or why not. Pure |
| `SourceModal` | The add/edit source form |
| `checkSource()` | One source's check against a `RemoteHost`. Pure |
| `SourceCheck` | Its result: `changes` (with `reason`), `mirrors` and `mirrored`, `forks` and `forked` |
| `MirrorChange` | An upstream file whose mirrors aren't what is at head |
| `checked()` / `acknowledged()` | State after a check / after "mark as seen" |
| `runCheck()` | Every source, from the vault; returns results and state to save |
| `CheckView` | The check view: the last check, and its clicks |
| `renderSource()` | Draws one source in the check view |
| `SourceUi` | What the user did to a source in the view: what's open, what's ticked, whether all files are shown |
| `fileTree()` | A folder tree (`TreeFolder`) from a flat list of paths. Pure |
| `forkablePaths()` / `forkableUnder()` | The files a check lists that can be forked; those under a folder, in what's new or all files (`FileList`). Pure |
| `planForks()` / `PlannedFork` | Where each file goes under a destination, numbered when its name is taken. Pure |
| `treeItem()` | A row in Obsidian's tree style; collapsible when given `open` |
| `RemoteHost` | What the plugin needs from a remote: `head`, `tree`, `changes`, `blob`, `diffStat` |
| `GitHost` | `RemoteHost` over the git CLI |
| `RunGit` / `gitRunner()` | Runs one git command; the real one is in `git-process.ts`, the only Node module |
| `RemoteError` | Remote failure, by `kind`: `no-git`, `git`, `not-found`, `bad-input` |
| `choose()` | A question with a few answers (`ChoiceModal`) |
| `vaultHost()` | The `RemoteHost` for this vault's settings. Desktop only |
| `Destination` | The fork modal's choice: each file's folder as in the source (`same`), or one `folder` |
| `initialDestination()` | The destination the modal opens with, and which rule chose it (`FolderReason`). Pure |
| `resolveForks()` | A destination, and a typed name for one file → the plan and its new folders, or the error. Pure |
| `forkPath()` / `freePath()` | Default vault path for a fork / the first free numbered one. Pure |
| `newForkMeta()` | Provenance for a file forked now. Pure |
| `startFork()` / `ForkSource` | Asks where one or several forks go (`ForkModal`), then writes them (`writeFork()`), or moves their mirrors (`forkMirror()`) |
| `mirrorFolderOf()` / `mirrorPath()` | A source's mirror folder under the community folder / a mirror's vault path in it. Pure |
| `planMirrors()` / `PlannedMirror` | What mirroring each file comes to: `new`, `mirrored` already, or its place `taken`. Pure |
| `newMirrorMeta()` / `updatedMirrorMeta()` / `forkedMeta()` | Provenance for a file mirrored now / after an update / as the fork a mirror becomes. Pure |
| `mirrorFiles()` | Mirrors files from a source at its head, without asking where |
| `updateMirror()` / `updateMirrors()` | Overwrites one upstream file's mirrors (asking if edited) / all of a check's (edited ones left) |
| `stopMirroring()` / `stopMirroringActive()` | Trashes a file's mirrors after asking / the `stop-mirroring` command |
| `mirrorsNow()` | Brings the last check in line with mirrors just added, dropped or updated |
| `noteParts()` / `writeWithProvenance()` | A note's parsed front matter and body / creates a note and adds its keys, never overwriting |
| `renderForkPreview()` | What the fork modal's choices would write, or the error |
| `suggestFolders()` | The vault's folders under a text field, to pick from while typing |
| `forkFromSource()` / `mirrorFromSource()` / `forkActiveMirror()` | The `fork-file`, `mirror-file` and `fork-mirror` commands |
| `renderForkList()` | A follow note's fork list section. Pure |
| `withSection()` / `withSections()` | A note with a plugin-owned `## …` section (or several) replaced. Pure |
| `writeSections()` | Writes plugin-owned sections into a note, once, only if they changed |
| `wantsForkList()` | Whether a follow note keeps a fork list: its `list_forks`, else the setting |
| `syncForkLists()` / `ForkLists` | Rewrites changed fork lists / keeps them current after vault changes |
| `remoteName()` / `remoteNameProblem()` / `defaultRemoteName()` | A follow note's name / why a name is invalid / the suggested name. Pure |
| `localKey()` / `isLocalRepo()` / `localName()` / `sourceKey()` | `local:<name>` / whether a key is local / its name / a valid key from data. Pure |
| `localPathInput()` / `fileUrl()` | A typed folder or `file:///` URL → absolute path / a path → `file:///` URL for git. Pure |
| `localFolder()` | A local source's folder on this computer, from `localPaths`, or a `not-found` error |
| `isForkOf()` / `Remote` | Whether a fork or a mirror belongs to a source: by its remote name, else its repo |
| `writeForkMeta()` | Sets a fork's `fork_*` keys and removes stale ones |
| `setForkSeen()` / `clearForkMeta()` | Sets `fork_seen` alone / removes every `fork_*` key |
| `ForkChange` | An upstream file that changed under its `copies` |
| `isSettled()` / `latestFirst()` | Whether a fork is settled for an upstream blob / copies, latest first. Pure |
| `Compare` / `readCompare()` | What a compare is of: source, upstream path, blob and head, and the note / the same from a view's state. Pure |
| `isEdited()` / `NoteParts` | Whether a note differs from the version it was forked from, `fork_*` keys aside. Pure |
| `alongsidePath()` | The `name (up-nn).md` path for a note written alongside. Pure |
| `updatedMeta()` | A fork's provenance after an overwrite. Pure |
| `openCompare()` / `compareChange()` / `compareActiveFork()` | Opens a compare / for a check's `ForkChange` / for the active note (the command) |
| `UpstreamView` | The Upstream view: the upstream file, and its actions |
| `loadCompare()` / `CompareInfo` | What the Upstream view shows |
| `overwrite()` / `writeAlongside()` / `keepMine()` | The compare's actions; each settles every copy |
| `detach()` / `keepGone()` | For a file gone upstream: remove the `fork_*` keys / set `fork_seen: gone` |
| `LinkRef` | A link or embed in a note's body, as the metadata cache gives it |
| `upstreamTarget()` / `UpstreamFiles` | The upstream path a link names, or `none: 'missing' \| 'several'` / the files it is read against. Pure |
| `danglingLink()` / `danglingName()` | A link by name to an upstream note with no copy / the shortest name that reads back as it. Pure |
| `missingLink()` | A link by its own name, for a target that is no one file upstream. Pure |
| `LinkPlan` / `Left` / `Check` | What becomes of a link, why it is left, the call made on it. Pure |
| `convertLinks()` / `Converted` | Rewrites a note's links from their plans, from the last back. Pure |
| `LinkTally` / `tallyText()` | Several notes' results / as a notice. Pure |
| `matchesExceptLinks()` | Whether two bodies differ only in how their links are written. Pure |
| `renderLinkReport()` / `renderCheckReport()` | The "Links to fix" / "Links to check" sections. Pure |
| `convertForks()` | Converts (or counts) the links in some sources' forks and rewrites their reports |
| `convertActiveFork()` / `convertAllForks()` | The `convert-links` / `convert-links-all` commands |
| `offerConvert()` | After a fork or overwrite: the notice with **Convert**, when links would convert |
| `inspectLocal()` / `LocalRepo` | What a local source's folder is: `missing`, `unusable`, `not-repo`, `bare`, `work`. Pure |
| `initLocal()` / `newRepoGitignore()` | Makes a folder a repo, with a `.gitignore`, and snapshots it. Pure |
| `snapshot()` / `SnapshotResult` | Commits a working folder's changes, if any. Pure |
| `prepareLocalFolder()` | Before adding a local source or setting its folder: refuse, offer to make a repo, or warn |
| `snapshotAndTell()` / `localFollows()` | Snapshots sources and reports each; offers to make a repo for a single non-repo / every local source |
