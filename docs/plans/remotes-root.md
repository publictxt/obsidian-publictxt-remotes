# Remotes root: design and implementation plan

A brief for whoever implements it. Read `AGENTS.md`, `docs/spec.md` (→ Data, Sources settings,
Fork) and `docs/naming.md` first.

> Decisions confirmed 2026-11-13. Building on `feat/remotes-folder-setting`.

## Context

Forks open by default in the global **Fork folder** (`forkFolder`, the vault root unless set),
flat, or in the source's own `folder` when its follow note sets one. Forks from different
sources mix, and a source's folders are flattened unless the user picks another layout at
each fork. publictext already keeps its forks as `remotes/txt/…`: one folder per source,
under one root, the source's folders kept inside it. publictxt-pages needs to know that root
to treat those pages as forks.

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
5. **The root is written to `settings/site.toml`** as `[params] remotesRoot = "remotes"`, for
   publictxt-pages (`.Site.Params.remotesRoot`). The plugin setting is the source of truth:
   the file is written when the setting changes, and when the plugin loads and the file says
   something else or has no such key. Only that one line is touched; the file is created when
   missing, with `[params]` and a comment.
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
  source unless its follow note says otherwise. Written to settings/site.toml for
  publictxt-pages.") where **Fork folder** was. **Clones folder** for `remotesFolder`.
- The source form's folder field: "Fork folder, under the remotes root. Empty: the source's
  name." Its placeholder is the name. The settings list shows `forks to: remotes/txt`.

Existing follow notes with a `folder` now read it under the root. Forks already made don't move.

### `settings/site.toml`

Pure: `withTomlParam(text, key, value)` in `src/util/site-toml.ts`, line-based, no TOML
library (no new dependencies):

- The `[params]` table runs from its header line to the next line starting with `[` (a table
  or array header, `[params.footer]` included), or the end.
- A line in it that sets `key` (`key =`, any spacing) is replaced, keeping its indentation and
  any trailing comment.
- Else the line is added after the table's last key line (or its header), indented like the
  table's first key (two spaces when it has none).
- No `[params]`: `\n[params]\n  key = "value"\n` at the end.
- No file: a comment saying the plugin writes `remotesRoot`, then the `[params]` table.
- The value is a TOML basic string (`\` and `"` escaped).

`null` (nothing to change) when the key already has that value. Not handled: `params` written
as an inline table or dotted keys (`params.remotesRoot = …`); such a file is left alone with a
notice.

Vault side, `src/settings-site.ts`: `syncSiteToml(app, root)` reads `settings/site.toml`,
writes it with `vault.process` (or `vault.create`, after `ensureFolder('settings')`) when
`withTomlParam` changes it. Called on layout ready and after the setting is saved (on blur, not
each keystroke).

## How to build it

1. **Pure:** `sourceFolderOf()`, `initialDestination()` with the root and the new default;
   `withTomlParam()`. Tests: defaults, a `folder`, an empty root, matching on and off, a file
   without folders; TOML: replace, keep comment and indent, add after the last key, before a
   subtable, no `[params]`, empty file, escaping, unchanged, inline table refused.
2. **Data and settings:** `remotesRoot`, `matchFolders` default, the labels, the source form's
   field, the `forks to:` line; the run passes the root and name into `initialDestination()`.
3. **site.toml:** `syncSiteToml()` on load and on save.
4. **Docs:** spec (Data, Sources settings, Fork), naming, intent, README.

Each step a commit; `npm run build`, `npm run lint`, `npm test` before each.

## Not in this work

- Moving forks already made into the root.
- publictxt-pages reading `remotesRoot` (its own repo).
- Reading the root back from `site.toml` when edited by hand.
