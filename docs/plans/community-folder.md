# Remotes root: design and implementation plan

A brief for whoever implements it. Read `AGENTS.md`, `docs/spec.md` (→ Data, Sources settings,
Fork) and `docs/naming.md` first.

> Decisions confirmed 2026-11-13. Built on `feat/remotes-folder-setting`. Next: following
> files (below).

## Context

Forks open by default in the global **Fork folder** (`forkFolder`, the vault root unless set),
flat, or in the source's own `folder` when its follow note sets one. Forks from different
sources mix, and a source's folders are flattened unless the user picks another layout at
each fork. publictext already keeps its forks as `remotes/txt/…`: one folder per source,
under one root, the source's folders kept inside it.

## Decisions

1. **One remotes root, a plugin setting.** `remotesRoot`, default `remotes`; `''` is the vault
   root. It replaces `forkFolder`, which goes: there is no global fork folder any more.
2. **Each source's forks go in a folder under the root.** The follow note's `folder` names it,
   relative to the root; with no `folder`, the remote name. So `txt` forks to `remotes/txt`, and
   `folder: research/ann` to `remotes/research/ann`. A `folder` is always under the root.
3. **Keeping source folders is the default layout.** The fork modal opens on **Into the
   folder, keeping source folders** with the source's folder: `wiki/cs/git.md` from `txt` goes
   to `remotes/txt/wiki/cs/git.md`. The other layouts stay in the dropdown; the user can still
   fork anywhere in the vault, including **Same folder as in the source**.
4. **Match source folders stays, default off.** On, the modal opens on **Same folder as in the
   source** when the vault has every file's folder, as now. Off (the default), it opens on the
   source's folder under the root.
5. **The plugin doesn't write `settings/site.toml`** (decided 2026-11-13). publictxt-pages
   reads the root from `[params] remotesRoot` there, set by hand; the root rarely changes. The
   setting's description says to keep the two the same.
6. **The clones folder is relabelled.** The setting **Remotes folder** (`remotesFolder`,
   `.remotes`, the git clones) becomes **Clones folder**, so it isn't taken for the root. The
   key stays.

## The design

### Where forks open

`initialDestination(paths, o)`, with `o.remotesRoot`, the source's `folder` and its name:

| Case | Layout | Folder | Reason |
|---|---|---|---|
| `matchFolders` on, and the vault has every file's folder | Same folder as in the source | the source's folder (kept for the dropdown) | matched |
| Otherwise | Into the folder, keeping source folders | `<root>/<folder or name>` | source (a `folder` is set) / default |

`sourceFolderOf(root, folder, name)` (pure) joins them, dropping empty parts. The modal's line
saying why ("The source's fork folder." / "Your vault has these folders." / "Under the remotes
root, named for the source.") follows the reason. A file with no folder in the source lands
straight in the source's folder: keeping folders and flat are the same for it.

### The setting and the follow note

- `PublicTxtData`: `remotesRoot` in, `forkFolder` out; `matchFolders` defaults to `false`.
  `normalizeData()` reads `remotesRoot` as a vault folder (`vaultFolder()`), else the default;
  an old `forkFolder` is ignored. Saved `matchFolders: true` stays on.
- Settings: **Remotes root** ("Forks from each source go in a folder under it, named for the
  source unless its follow note says otherwise. If you publish with publictxt-pages, set
  remotesRoot under [params] in settings/site.toml to match.") where **Fork folder** was. **Clones folder** for `remotesFolder`.
- The source form's folder field: "Fork folder, under the remotes root. Empty: the source's
  name." Its placeholder is the name. The settings list shows `forks to: remotes/txt`.

Existing follow notes with a `folder` now read it under the root. Forks already made don't move.

## How to build it

1. **Pure:** `sourceFolderOf()`, `initialDestination()` with the root and the new default.
   Tests: defaults, a `folder`, an empty root, matching on and off, a file without folders.
2. **Data and settings:** `remotesRoot`, `matchFolders` default, the labels, the source form's
   field, the `forks to:` line; the run passes the root and name into `initialDestination()`.
3. **Docs:** spec (Data, Sources settings, Fork), naming, intent, README.

Each step a commit; `npm run build`, `npm run lint`, `npm test` before each.

## Next: following files

The branch after this one (decided in outline 2026-11-13; details to confirm in its own plan).
This branch puts forks where followed files will live, so nothing here changes then.

| Action | What it does | The note is |
|---|---|---|
| **Follow a repo** (as now) | A follow note in `follows/`; a check shows what's new | — |
| **Follow files** (new) | Copies the picked files to `<root>/<folder>/`, the source's folders kept, links as upstream wrote them | Upstream's: kept current, searchable in Obsidian, not for editing |
| **Fork** | Moves a followed file into the user's own notes and offers to convert its links; or forks straight from the source, as now | The user's: updates go through Compare |

- **A followed file is updated by overwriting**, no Compare: it is upstream's copy. That is
  what makes it more than a fork in another folder. If it was edited anyway, the update asks.
- **Forking a followed file moves it** (`fileManager.renameFile`, so Obsidian updates links to
  it), never copies: two notes of one name would split every `[[name]]`. Its own links are
  then converted (`docs/plans/convert-links.md`): converting belongs where a note leaves
  upstream's layout, since that is where its relative links break. The convert offer moves
  from Follow to Fork.
- **Unfollowing a file** deletes it from the root, after asking: nothing of the user's is lost.
- **Watch** (a file reported on when it changes, not copied in) stays as it is for now; whether
  it folds into following a file is open.
- The check view labels each file's actions **Follow** and **Fork**.

### Front matter for followed files

Open. A followed file needs the same provenance as a fork (source, path, branch, commit, blob,
date), not `fork_seen` (an update overwrites it). The keys are published with the note, so
they should say what it is. Options:

1. **`follow_*` keys** (`follow_remote`, `follow_repo`, `follow_path`, `follow_branch`,
   `follow_commit`, `follow_blob`, `follow_date`). Forking renames them to `fork_*`: the text
   came from that blob, so `fork_blob` is right. A published note says plainly whether it is a
   followed copy or the author's fork. The fork-meta reader takes a prefix. Recommended.
2. **`fork_*` keys, where the note is tells**: under the root, followed; elsewhere, forked. No
   new keys, but a note moved by hand changes kind silently, and a published note doesn't say.
3. **`fork_*` keys plus `fork_followed: true`**, removed on forking. Explicit, but a followed
   note still reads as a fork to anyone who doesn't know the flag.

## Not in this work

- Moving forks already made into the root.
- publictxt-pages reading `remotesRoot` (its own repo).
- Writing or reading `settings/site.toml`.
