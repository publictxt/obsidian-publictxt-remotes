# PublicTxt Remotes — Naming

Names used in code, docs and UI. Nothing is released, so all of it can still change; plugin id
and command ids freeze at the first release.

## Plugin identity

| Thing | Name | Notes |
|---|---|---|
| Repo | `publictxt/obsidian-publictxt-remotes` | Renamed from `obsidian-publictxt` (2026-11-10) |
| Plugin `id` | `publictxt-remotes` | Freezes at the first release. Remotes: repos and vaults elsewhere; a local source is the special case |
| Display `name` | PublicTxt Remotes | |
| View type | `publictxt-check` | Freezes at the first release |
| Command ids | `check-sources`, `open-check-view`, `fork-file`, `snapshot-local-sources`, `update-fork-lists` | Freeze at the first release |

## Vocabulary

| Word | Means |
|---|---|
| source | A repo the user follows, hosted or local: a follow note in `follows/` (publictext spec §3.2) |
| follow note | The note that is a source; front matter holds its fields, the body the user's prose |
| include | Folder prefixes narrowing a source's "what's new" |
| watch | Remote files reported on whenever they change |
| fork | A vault note copied from a source file, carrying `fork_*` provenance |
| fork list | The "Forked pages" section the plugin keeps in a follow note |
| check | One pass over the sources: what's new, watched, forks |
| head | The tracked branch's latest commit |
| blob | A file's git blob SHA |
| clone | A source's bare partial clone under `remotesFolder` |
| remote name | A source's name: its follow note's file name. Forks record it as `fork_remote` |
| source key | `Source.url`: the canonical URL, or `local:<name>` for a local source |
| local source | A source on this computer: `local: true` in its note, its folder in `localPaths`; "local repo" in code |
| snapshot | A commit of everything changed in a local source's folder, made only if something changed |
| make a repo | `git init` a local source's folder, with a `.gitignore`, then snapshot it |

## Code identifiers

| Name | What |
|---|---|
| `PublicTxtData` | Everything in `data.json`: `{ version, forkFolder, matchFolders, listForks, remotesFolder, gitPath, state, localPaths }` |
| `Source` | One followed repo, read from its follow note |
| `FOLLOWS_FOLDER` | `follows` |
| `readFollow()` / `followProps()` | Front matter ↔ `Source` |
| `collectFollows()` | Follow notes → sources, duplicates and invalid notes |
| `SourceState` | Per-source cache |
| `ForkMeta` | A fork's provenance, read from or written to front matter |
| `canonicalRepoUrl()` | v0 canonical repo URL (`https:`), or `null` |
| `normalizeData()` | Anything loaded → valid `PublicTxtData` |
| `readForkMeta()` / `forkMetaProps()` | Front matter ↔ `ForkMeta` |
| `SourceForm` | The source form's raw text; lists one path per line |
| `checkAdd()` / `checkUpdate()` | Form → the source to write, or why not. Pure |
| `SourceModal` | The add/edit source form |
| `checkSource()` | One source's check against a `RemoteHost`. Pure |
| `SourceCheck` | Its result: `changes` (with `reason`), `watched`, `forks` |
| `checked()` / `acknowledged()` | State after a check / after "mark as seen" |
| `runCheck()` | Every source, from the vault; returns results and state to save |
| `CheckView` | The check view: the last check, and its clicks |
| `renderSource()` | Draws one source in the check view |
| `SourceUi` | What the user did to a source in the view: what's open, what's ticked |
| `fileTree()` | A folder tree (`TreeFolder`) from a flat list of paths. Pure |
| `forkablePaths()` / `forkableUnder()` | The files a check lists that can be forked; those under a folder. Pure |
| `planForks()` | Where each of several files goes when forked together. Pure |
| `treeItem()` | A row in Obsidian's tree style; collapsible when given `open` |
| `RemoteHost` | What the plugin needs from a remote: `head`, `tree`, `changes`, `blob` |
| `GitHost` | `RemoteHost` over the git CLI |
| `RunGit` / `gitRunner()` | Runs one git command; the real one is in `git-process.ts`, the only Node module |
| `RemoteError` | Remote failure, by `kind`: `no-git`, `git`, `not-found`, `bad-input` |
| `choose()` | A question with a few answers (`ChoiceModal`) |
| `vaultHost()` | The `RemoteHost` for this vault's settings. Desktop only |
| `forkFolder()` | The folder a fork goes to, and which rule chose it (`FolderReason`). Pure |
| `forkPath()` / `freePath()` | Default vault path for a fork / the first free numbered one. Pure |
| `newForkMeta()` | Provenance for a file forked now. Pure |
| `startFork()` / `ForkRequest` | Asks where to put a fork (`ForkModal`), then writes it (`writeFork()`) |
| `startForkMany()` | Shows where several forks would go (`ForkManyModal`), then writes them all |
| `forkFromSource()` | The fork command: pick a source, then a file |
| `renderForkList()` / `withForkList()` | A follow note's fork list section / the note with it replaced. Pure |
| `wantsForkList()` | Whether a follow note keeps a fork list: its `list_forks`, else the setting |
| `syncForkLists()` / `ForkLists` | Rewrites changed fork lists / keeps them current after vault changes |
| `remoteName()` / `remoteNameProblem()` / `defaultRemoteName()` | A follow note's name / why a name is invalid / the suggested name. Pure |
| `localKey()` / `isLocalRepo()` / `localName()` / `sourceKey()` | `local:<name>` / whether a key is local / its name / a valid key from data. Pure |
| `localPathInput()` / `fileUrl()` | A typed folder or `file:///` URL → absolute path / a path → `file:///` URL for git. Pure |
| `localFolder()` | A local source's folder on this computer, from `localPaths`, or a `not-found` error |
| `isForkOf()` / `Remote` | Whether a fork belongs to a source: by `fork_remote`, else `fork_repo` |
| `writeForkMeta()` | Sets a fork's `fork_*` keys and removes stale ones |
| `inspectLocal()` / `LocalRepo` | What a local source's folder is: `missing`, `unusable`, `not-repo`, `bare`, `work`. Pure |
| `initLocal()` / `newRepoGitignore()` | Makes a folder a repo, with a `.gitignore`, and snapshots it. Pure |
| `snapshot()` / `SnapshotResult` | Commits a working folder's changes, if any. Pure |
| `prepareLocalFolder()` | Before adding a local source or setting its folder: refuse, offer to make a repo, or warn |
| `snapshotAndTell()` / `localFollows()` | Snapshots sources and reports each; offers to make a repo for a single non-repo / every local source |
