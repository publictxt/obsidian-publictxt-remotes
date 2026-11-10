# PublicTxt — Naming

Names used in code, docs and UI. Nothing is released, so all of it can still change; plugin id
and command ids freeze at the first release.

## Plugin identity

| Thing | Name | Notes |
|---|---|---|
| Repo | `publictxt/obsidian-publictxt` | |
| Plugin `id` | `publictxt` | Freezes at the first release |
| Display `name` | PublicTxt | |
| View type | `publictxt-check` | Freezes at the first release |
| Command ids | `check-sources`, `open-check-view`, `fork-file` | Freeze at the first release |

## Vocabulary

| Word | Means |
|---|---|
| source | A remote repo the user follows: a follow note in `follows/` (publictext spec §3.2) |
| follow note | The note that is a source; front matter holds its fields, the body the user's prose |
| include | Folder prefixes narrowing a source's "what's new" |
| watch | Remote files reported on whenever they change |
| fork | A vault note copied from a source file, carrying `fork_*` provenance |
| check | One pass over the sources: what's new, watched, forks |
| head | The tracked branch's latest commit |
| blob | A file's git blob SHA |
| clone | A source's bare partial clone under `remotesFolder` |

## Code identifiers

| Name | What |
|---|---|
| `PublicTxtData` | Everything in `data.json`: `{ version, forkFolder, matchFolders, remotesFolder, gitPath, state }` |
| `Source` | One followed repo, read from its follow note |
| `FOLLOWS_FOLDER` | `follows` |
| `readFollow()` / `followProps()` | Front matter ↔ `Source` |
| `collectFollows()` | Follow notes → sources, duplicates and invalid notes |
| `SourceState` | Per-source cache |
| `ForkMeta` | A fork's provenance, read from or written to front matter |
| `canonicalRepoUrl()` | v0 canonical repo URL, or `null` |
| `normalizeData()` | Anything loaded → valid `PublicTxtData` |
| `readForkMeta()` / `forkMetaProps()` | Front matter ↔ `ForkMeta` |
| `SourceForm` | The source form's raw text; lists one path per line |
| `checkAdd()` / `checkUpdate()` | Form → the source to write, or why not. Pure |
| `SourceModal` | The add/edit source form |
| `checkSource()` | One source's check against a `RemoteHost`. Pure |
| `SourceCheck` | Its result: `changes` (with `reason`), `watched`, `forks` |
| `checked()` / `acknowledged()` | State after a check / after "mark as seen" |
| `runCheck()` | Every source, from the vault; returns results and state to save |
| `CheckView` | The check view |
| `RemoteHost` | What the plugin needs from a remote: `head`, `tree`, `changes`, `blob` |
| `GitHost` | `RemoteHost` over the git CLI |
| `RunGit` / `gitRunner()` | Runs one git command; the real one is in `git-process.ts`, the only Node module |
| `RemoteError` | Remote failure, by `kind`: `no-git`, `git`, `not-found`, `bad-input` |
| `vaultHost()` | The `RemoteHost` for this vault's settings. Desktop only |
| `forkFolder()` | The folder a fork goes to, and which rule chose it (`FolderReason`). Pure |
| `forkPath()` / `freePath()` | Default vault path for a fork / the first free numbered one. Pure |
| `newForkMeta()` | Provenance for a file forked now. Pure |
| `startFork()` / `ForkRequest` | Asks where to put a fork (`ForkModal`), then writes it (`writeFork()`) |
| `forkFromSource()` | The fork command: pick a source, then a file |
