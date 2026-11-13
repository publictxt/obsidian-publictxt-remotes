# Community folder and mirrors: design and implementation record

Read `AGENTS.md`, `docs/spec.md` (→ Data, Mirror, Fork) and `docs/naming.md` first.

> Two branches. `feat/remotes-folder-setting` (merged 2026-11-13) built one folder per source
> under a root. `feat/mirror-pages` renamed it and built mirrors on it. This file was the plan
> for the first; it now records both, in the names that were kept.

## What was renamed (2026-11-13)

Nothing is released, so everything could change. Old names appear in history only.

| Was | Now | Why |
|---|---|---|
| remotes root, `remotesRoot`, `remotes/` | community folder, `communityFolder`, `community/` | It is a section of the published site: named for readers, with the word publictxt-pages uses for where pages came from |
| clones folder key `remotesFolder`, `.remotes/` | `clonesFolder`, `.clones/` | `remotes/` and `.remotes/` in one vault were taken for each other |
| "follow files", `follow_*` keys (planned) | mirror, `mirror_*` | "Follow" stays for repos only; publictxt-pages already writes `follow_name` and `follow_url` on follow pages |
| source's **Fork folder** (`folder`) | **Mirror folder** | It names the source's folder of mirrors |
| `watch`, `watched`, the Watched list | gone | A mirror is a watched file the vault also holds |
| `sourceFolderOf()` | `mirrorFolderOf()` | |

Kept: `follows/` and "follow note" (the user's own note, and on the site the page saying who
they follow); "source" for a followed repo; "remote" as the technical word (plugin name,
remote name, `fork_remote`).

## The three steps

| Action | What it does | The note is |
|---|---|---|
| **Follow a repo** | A follow note in `follows/`; a check shows what's new | — |
| **Mirror** | Copies the picked files to `<community folder>/<mirror folder>/`, the source's folders kept, links as upstream wrote them | Upstream's: kept current by overwriting, searchable in Obsidian, not for editing |
| **Fork** | Moves a mirror into the user's own notes and offers to convert its links; or forks straight from the source | The user's: updates go through Compare |

## Decisions

1. **One community folder, a plugin setting.** `communityFolder`, default `community`; `''` is
   the vault root.
2. **Each source's mirrors go in a folder under it.** The follow note's `folder` names it,
   relative to the community folder; with no `folder`, the remote name. So `txt` mirrors to
   `community/txt`, and `folder: research/ann` to `community/research/ann`.
3. **A mirror keeps the path it has upstream**: `wiki/cs/git.md` from `txt` is
   `community/txt/wiki/cs/git.md`. Nothing is asked. Its relative links mostly work, since
   the source's layout is kept.
4. **A mirror is updated by overwriting**, no Compare: it is upstream's copy. An edited one
   is asked about (one at a time) or left and named (all at once).
5. **A check reports mirrors that are behind and writes nothing.** The user selects
   **Update** or **Update mirrors**. This is also what Watch was for.
6. **Forking a mirror moves it** (`fileManager.renameFile`, so Obsidian updates links to it),
   never copies: two notes of one name would split every `[[name]]`. Its keys become
   `fork_*`; `fork_blob` is the blob it mirrored, since its text came from it. Converting
   links is offered then: that is when a note leaves upstream's layout.
7. **Forks don't open under the community folder.** Upstream's copies live there; the user's
   notes elsewhere. The fork modal opens on **Same folder as in the source** when the vault
   has it (`matchFolders`, now on by default), else on the **Fork folder** (`forkFolder`,
   back as a setting; the vault root unless set).
8. **Follow notes can list their mirrors, as they list their forks**: a **Mirrored pages**
   section with its own switch (`listMirrors`, `list_mirrors`), apart from the fork list's.
9. **Keys decide what a note is, not its folder**: `mirror_*` or `fork_*`. A note moved by
   hand doesn't change kind, and a published note says which it is. Valid `fork_*` keys win;
   writing one kind removes the other.
10. **Stopping deletes the mirror**, after asking: nothing of the user's is lost.
11. **The plugin doesn't write `settings/site.toml`.** publictxt-pages names the community
    folder in its own settings, set by hand.

## How it was built

1. **Rename:** `communityFolder`, `clonesFolder` and `.clones`; `forkFolder` back;
   `matchFolders` on by default; `watch` and `watched` removed.
2. **Pure:** `mirror_*` keys in `fork-meta.ts`; `src/mirror/mirror.ts` (`mirrorFolderOf()`,
   `mirrorPath()`, `planMirrors()`, the provenance makers); mirrors in `checkSource()`;
   `initialDestination()` with the fork folder. Tests for each.
3. **Vault side:** `src/mirror/run.ts` (mirror, update, stop); `startFork()` moves a mirrored
   file; the check view's rows, section and buttons; three commands.
4. **Docs:** spec, naming, intent, README, this file.

## Not in this work

- **publictxt-pages** (its own repo, branch `feat/mirrors`): reads `mirror_*` as well as
  `fork_*` for a page's source, labels a mirror "From *source*" (a fork stays "Forked
  from"), and defaults `hiddenCollections` to `community`.
- **publictext spec** (its own repo): mirrors are §5.5, with ADR-0017. `community/` was
  pencilled in there for profiles, groups and discussion; where those live is now open.
- **Existing vaults:** nothing is migrated. Rename `.remotes/` to `.clones/` (or it clones
  again). Forks already under `remotes/<source>/` stay forks where they are.
- Attachments: only Markdown is mirrored, so a mirror's embedded images don't come with it.
- Updating mirrors without being asked (at each check), if it turns out to be wanted.
