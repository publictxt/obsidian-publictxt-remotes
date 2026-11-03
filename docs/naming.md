# PublicTxt — Naming

Names used in code, docs and UI. Nothing is released, so all of it can still change; plugin id
and command ids freeze at the first release.

## Plugin identity

| Thing | Name | Notes |
|---|---|---|
| Repo | `publictxt/obsidian-publictxt` | |
| Plugin `id` | `publictxt` | Freezes at the first release |
| Display `name` | PublicTxt | |

## Vocabulary

| Word | Means |
|---|---|
| source | A remote repo the user follows. Matches an entry of `follows` in `publictxt.yaml` |
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
| `PublicTxtData` | Everything in `data.json`: `{ version, forkFolder, remotesFolder, gitPath, sources, state }` |
| `Source` | One followed repo (config) |
| `SourceState` | Per-source cache |
| `ForkMeta` | A fork's provenance, read from or written to front matter |
| `canonicalRepoUrl()` | v0 canonical repo URL, or `null` |
| `normalizeData()` | Anything loaded → valid `PublicTxtData` |
| `readForkMeta()` / `forkMetaProps()` | Front matter ↔ `ForkMeta` |
| `SourceForm` | The source form's raw text; lists one path per line |
| `addSource()` / `updateSource()` / `removeSource()` | Edits to `PublicTxtData.sources`, pure |
| `SourceModal` | The add/edit source form |
| `RemoteHost` | What the plugin needs from a remote: `head`, `tree`, `changes`, `blob` |
| `GitHost` | `RemoteHost` over the git CLI |
| `RunGit` / `gitRunner()` | Runs one git command; the real one is in `git-process.ts`, the only Node module |
| `RemoteError` | Remote failure, by `kind`: `no-git`, `git`, `not-found`, `bad-input` |
