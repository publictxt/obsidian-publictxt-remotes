# Fork update: design and implementation plan

A brief for whoever implements it. It is self-contained, but read `AGENTS.md`, `docs/spec.md`
(→ Fork provenance, Check, Check view, Remote host) and `docs/naming.md` first.

## Context

PublicTxt Remotes is an Obsidian plugin (TypeScript, desktop only, git CLI). The user follows
git repos ("sources") and **forks** Markdown files from them: a fork is a note in the vault
with `fork_*` keys in its front matter. `fork_blob` is the git blob SHA of the file when it
was forked.

A check already finds forks whose original changed: the blob at the source's head differs from
`fork_blob`, or the file is gone. The check view lists them under **Forks changed upstream**.
That is where it ends today: the user can open the fork, and nothing else. A changed fork stays
listed for ever.

This work lets the user look at the new upstream version beside their copy, and then take it,
keep a copy of it, or wave it off.

## Decisions already made

1. **Compare in a split pane**, not a modal: the user's note in one pane, the upstream version
   read-only in a pane beside it. No merge, no line-by-line diff in this work.
2. **Write alongside** saves upstream next to the note as `name (up-01).md`, then `(up-02)`, …
3. **The alongside note is itself a fork** it gets `fork_*` keys. So one upstream file can
   have several notes forked from it. They are its **copies**, and the newest is the one
   compared next time.
4. **`fork_seen`**, a new front matter key: the upstream blob the user last dealt with. A copy
   stops being listed for an upstream version once it has seen it. `fork_blob` never moves
   except when the note's text is replaced: it stays the record of what the text came from.

## The design

### Copies

The **copies** of an upstream file are the fork notes with the same source and the same
`fork_path` (`forksOf()` in `src/fork/fork.ts` already finds them). They are derived by
scanning, like everything else; nothing links them.

The **latest** copy is the one with the newest `fork_date`; a copy without a date is older
than any with one; ties go to the path, in byte order.

A copy is **settled** for an upstream blob when its `fork_blob` or its `fork_seen` is that
blob. The check lists an upstream file when any of its copies is not settled for the blob at
head. Every action below settles every copy, so in practice a file is listed until the user
acts on it once.

### Check view

**Forks changed upstream** lists one row per upstream file, not per note:

```text
changed upstream   wiki/cs/algorithms.md                  [Compare]
                   algorithms (up-01).md · latest
                   algorithms.md
gone upstream      wiki/old.md                             [Detach] [Keep]
                   old.md
```

- The upstream path, then its copies, latest first, each a link that opens the note. With more
  than one copy, the latest says so.
- **Compare** opens the compare (below) for the latest copy. Selecting it on a different copy's
  line isn't offered: to compare another copy, open that note and use the command **Compare
  this fork with upstream**, which works on the active note if it is a fork.
- Gone upstream has nothing to compare: **Detach** removes the `fork_*` keys from every copy
  (after confirming; the notes stay). **Keep** sets `fork_seen: gone` on every copy, so they
  stay forks and stop being listed, until the file comes back.

### The compare

Two panes side by side in the main area: the copy on the left, opened as a normal note; on the
right, a new view, **Upstream** (`publictxt-upstream`), read-only.

```text
┌ algorithms (up-01).md ─────────┬ Upstream: wiki/cs/algorithms.md ─────────────┐
│                                │ research · main · 12 lines added, 3 removed  │
│  (the note, editable as usual) │ since you forked. Your copy is edited.       │
│                                │ [Overwrite] [Write alongside] [Keep mine]    │
│                                │ [Show source]                                │
│                                │ ──────────────────────────────────────────── │
│                                │  (the upstream file, rendered)               │
└────────────────────────────────┴──────────────────────────────────────────────┘
```

The header says:

- The source and branch.
- **What changed**: lines added and removed between the copy's `fork_blob` and the blob at
  head (`git diff --numstat` on the two blobs). If the old blob can't be read (upstream
  rewrote its history), say "Can't tell what changed: the version you forked is gone
  upstream." and go on.
- **Whether the copy is edited** since it was forked: "Your copy is edited." / "Your copy is
  as you forked it." / "Can't tell whether your copy is edited." (old blob unreadable). Edited
  means: the body differs from the forked version's body, or the front matter differs, parsed
  and with the `fork_*` keys left out. Compare parsed front matter, not its text: Obsidian
  reformats YAML when it adds the keys.

The body is the upstream file rendered as Markdown; **Show source** switches to its plain text
(front matter included) and back.

The view's state is the source key, repo path, upstream blob and the copy's vault path, so it
survives a restart: it fetches the blob again. If the copy is gone or no longer a fork, it
says so and offers nothing.

### The actions

All three end the same way: **every copy of the file is settled** for this upstream blob, the
row leaves the check view, and the Upstream pane closes.

| Action | The compared copy | The other copies |
|---|---|---|
| **Overwrite** | Text replaced by upstream; `fork_*` keys rewritten for the new blob, commit and date; `fork_seen` removed | `fork_seen` set |
| **Write alongside** | `fork_seen` set | `fork_seen` set |
| **Keep mine** | `fork_seen` set | `fork_seen` set |

- **Overwrite** asks first when the copy is edited or can't be told: "Your edits to
  `<note>` will be replaced, front matter included. Obsidian's file recovery can bring them
  back." Unedited: no question. The note keeps its name and path.
- **Write alongside** creates a new fork from the upstream blob, exactly as a fresh fork is
  written (`writeFork()`), in the compared copy's folder. Its name is the copy's name with any
  ` (up-nn)` ending removed, then ` (up-nn)`: `nn` is two digits from `01`, the first that is
  free. So `algorithms (up-01).md` gives `algorithms (up-02).md`, never
  `algorithms (up-01) (up-01).md`. The new note opens in the left pane, where the copy was.
  It is now the latest copy.
- **Keep mine** changes no text.

Nothing is ever overwritten except by **Overwrite**, on the one note it names.

### Not in this work

- Merging (three-way, conflict markers) and line-level highlighting of changes.
- A one-click **Update** in the check view for unedited copies. It needs the edited test for
  every changed fork during the check, which costs a fetch each; see how the compare feels
  first.
- Removing old copies. The user deletes notes as they like; the lists follow.
- Comparing against anything but the source's tracked branch.

## How to build it

The project splits each feature into a **pure** module (no Obsidian imports, tested with
`node --test`) and its **Obsidian side**. Keep to that.

### 1. `fork_seen` (`src/sources/fork-meta.ts`, `tests/fork-meta.test.ts`)

- `ForkMeta.seen: string | null`: a blob SHA, or the word `gone`. Anything else reads as
  `null`.
- Add `fork_seen` to `FORK_KEYS`, last. `writeForkMeta()` already removes every key it doesn't
  set, so a fresh fork or an overwrite clears it; `newForkMeta()` sets `seen: null`.
- `setForkSeen(front, seen)`: sets that one key in place, for the notes that are only settled.

### 2. Copies and the check (`src/check/check.ts`, `tests/check.test.ts`)

- `ForkChange` becomes one per upstream file: `{ path, status, blob, copies: Fork[] }`, copies
  latest first. Pure helpers: `latestFirst(forks)`, `isSettled(meta, blob | null)` (`null`:
  gone upstream, settled by `fork_seen: gone`).
- `checkSource()` groups the source's forks by `fork_path` and lists a file when any copy is
  not settled. A file that is back after `fork_seen: gone` is listed again if its blob differs
  from `fork_blob`.
- Update what reads `c.forks`: `hasNews()`, the check view's summary and list.

### 3. Pure update logic: `src/fork/update.ts`, `tests/update.test.ts`

- `isEdited(note: { front, body }, forked: { front, body })`: the rule under "Whether the copy
  is edited". Deep-equal on parsed front matter without `FORK_KEYS`.
- `alongsidePath(notePath, taken)`: the ` (up-nn)` rule.
- `updatedMeta(old, head, blob, now)`: the provenance after an overwrite (remote, repo and path
  kept; branch, commit, blob and date new; `seen` null).

Test at least: edited by body, by a user key, not by `fork_*` keys or key order; `alongsidePath`
from a plain name, from an `(up-nn)` name, with `01` taken, with a dot in a folder name.

### 4. Lines changed (`src/remote/host.ts`, `src/remote/git.ts`, `tests/git.test.ts`)

`RemoteHost.diffStat(repo, from, to)`: `{ added, removed }` between two blobs, or `null` when
either can't be read. `GitHost`: `diff --numstat <from> <to>` in the clone; a partial clone
fetches a missing blob on demand, and a failure there is the `null`. Add it to the fake hosts
in the tests.

### 5. The Upstream view: `src/ui/upstream-view.ts`

An `ItemView`. Draws only, like `src/ui/check-source.ts`: its buttons carry `data-action`, and
one click handler in the view calls the actions. Render with `MarkdownRenderer.render()`, the
view as the component, so it is cleaned up. `getState()` / `setState()` as described.
Register it in `src/main.ts`.

### 6. The actions: `src/fork/update-run.ts`

The Obsidian side of `update.ts`: `openCompare(app, data, source, change, copy)` (open the note,
split, set the view's state), `overwrite`, `writeAlongside`, `keepMine`, `detach`, `keepGone`.
Each ends by settling the other copies with `processFrontMatter` and telling the plugin to drop
the row from the last run and redraw (as `acknowledge()` in `src/main.ts` does for a source).
Reuse `writeFork()` and `errorText()`; errors are notices.

Add the command **Compare this fork with upstream** (`compare-fork`): the active note must be
a fork of a followed source; it fetches that source's head itself, as **Fork a file from a
source** does, and says "Nothing new upstream." when the blob is settled.

### 7. The check view (`src/ui/check-source.ts`, `src/ui/check-view.ts`)

The rows under "Check view" above, with `data-action` `compare`, `detach`, `keep-gone` and the
upstream path in `data-path`. Rows use `treeItem()` like the rest of the view.

### 8. Docs, with the code they describe

- `docs/spec.md`: `fork_seen` in **Fork provenance**; step 4 of **Check** and the sentence
  "Forks are acknowledged only by updating them (later slice)"; **Check view**; `diffStat` in
  **Remote host**; a new **Fork update** section; **Build order**.
- `docs/intent.md`: open question 5 (local edits) is answered by the edited test; add the
  decisions above with today's date; propose `fork_seen` in the last section.
- `docs/naming.md`: copy, latest, settled, and the new names.
- `README.md`: the checking and fork bullets, and the commands table.

## Working rules

- Branch `feat/fork-update` from the branch that has the fork modal work. Small commits, one
  idea each, titled `Area: what changed` in plain words, with a short body saying why; a docs
  commit at the end. Don't push. No AI attribution lines in commits.
- Readability and maintainability first. Match the code around you: a header comment per file,
  a short doc comment on each exported name, comments that say why. Files under about 200
  lines, one job each.
- No new dependencies. No Node imports outside `src/remote/git-process.ts`.
- Before each commit: `npm run build`, `npm run lint` (existing warnings only, no errors),
  `npm test`.
- UI text in sentence case, short, in the plain words the existing strings use.

## Checking it by hand

The views can't be tested from the command line. Build, reload the plugin, and try with a
local source (change a file in its folder, **Snapshot**, **Check**); report what you could not
check:

1. A fork changed upstream shows one row; **Compare** opens the note and the Upstream pane
   side by side, with the line counts and "as you forked it".
2. Edit the note: compare again says "edited"; **Overwrite** asks first, then replaces the
   text and the row goes.
3. **Write alongside** makes `name (up-01).md` as a fork, opens it, and the row goes; change
   upstream again: one row, two copies, the `(up-01)` one latest; alongside again gives
   `(up-02)`.
4. **Keep mine**: the row goes and stays gone at the next check; a further upstream change
   brings it back.
5. Remove the file upstream: **Keep** quiets it, **Detach** removes the keys and the note is
   no longer in the fork list.
6. Restart Obsidian with the Upstream pane open: it comes back with its content.
7. **Compare this fork with upstream** on a fork, on a non-fork, and with nothing new.
