# Plan: tags on remote pages

Status: planned, not started. When a step is built, its facts move to `docs/features/tags.md` and
the files named under [Docs](#docs); this plan goes when step 2 is done.

| Step | Gives |
|---|---|
| [1. Filter](#step-1-filter-by-tag) | Find a source's pages by tag, or a combination of tags |
| [2. Follow](#step-2-followed-tags) | Save combinations per source; a check lists matching changes first |
| [Later](#later) | Other tools reading the index; search across sources; ratings per tag |

Both steps stand on the [tag index](#the-tag-index).

## Design in short

- Tags are in file contents, and clones don't hold contents up front. They are fetched the first
  time tags are used for a source; a plain check stays as light as now.
- What was read is kept as a **tag index**: one file per commit, inside the clone. Memory is the
  working copy; the file is written later, when idle.
- The next commit's index reuses tags by blob (git's id for a file's contents), so it reads only
  contents not seen before. The blobs come from git, not from the file.
- Filtering happens when reading, over the whole followed repo (publictext ADR-0005).

## What is a tag

The publictext spec's rules (§7), so every tool agrees:

- **From**: front matter `tags` (a list, or one string; a leading `#` stripped), then inline
  `#tags` in the body.
- **Inline**: `#` at the start of a line or after whitespace, then Unicode letters, digits, `_`,
  `-`, `/`, at least one not a digit. Not in fenced code or inline code.
- **Compared** by `match`: Unicode NFC, then lower case. Stored as written (ADR-0006).
- **Nested**: `dev` matches `dev` and `dev/app`, included or excluded, as in Obsidian and
  publictxt-pages. Parents are worked out when filtering, not stored.

Obsidian's metadata cache can't be used: the pages aren't in the vault.

## The tag index

### File

```
<clonesFolder>/<host>/<owner>/<repo>.git/publictxt/tags-<commit>.json
```

```json
{
  "version": 1,
  "files": {
    "wiki/Plain text.md": ["PlainText", "dev/app"],
    "wiki/Untagged.md": []
  }
}
```

- `files` holds the Markdown files read, untagged ones too. Tags are as written, deduped by
  `match`.
- `version` covers the format and the tag rules. Another version's file is ignored.
- A Markdown file at that commit, within `include`, that isn't in `files` is **unread**. So a
  partial index is valid, and a changed `include` needs nothing special: files it adds are
  unread, files it drops are ignored.

**Why there.** It is made from the clone and goes with it. `clonesFolder` is already hidden,
git-ignored and safe to delete, and derived data must not be committed (spec §2). Git leaves
folders it doesn't know alone.

### Getting an index

On the first tag use for a source at a commit:

| Found | Read | Saved after |
|---|---|---|
| In memory | Nothing | No |
| That commit's file | The file | No |
| Another commit's, in memory or a file | It, and the contents it lacks | Yes |
| Nothing usable | Every Markdown blob within `include` | Yes |
| Some blobs can't be read (offline) | What can be | Yes, without them |

To reuse another commit's index:

1. Its file: path → tags.
2. `ls-tree` of its commit: path → blob. With 1, blob → tags.
3. `ls-tree` of head: path → blob. Read only the blobs not in 2.

So a rename, a branch change, **Local** / **Remote** and rewritten history all need only contents
not seen before. Step 2 runs with lazy fetching off; if that commit is gone, the index is built
from nothing. Unread pages are tried again at the next tag use.

### Saving

- **When**: a few seconds after indexing settles (`debounce`), then at an idle moment
  (`requestIdleCallback`). Filtering never writes, and never waits for a write.
- **Only if needed**: something was read since that commit's index was loaded or saved.
- **How**: to a temporary name, then renamed, so a file is whole or absent.
- **Never recreates a clone**: a save makes `publictxt/` but not its parents. If the clone was
  deleted meanwhile it does nothing; a folder there that isn't a repo would fail the next check.
- **Prune**: after a save, only head's and `seenCommit`'s files stay. Memory keeps the same two.
- **Unload**: a pending save is cancelled. At worst the index is built again.

### Cost

Cold rebuild from a clone that has its contents, with notes from a real repo copied up to size:

| Notes | Text | List, read, parse | Load a saved index |
|---|---|---|---|
| 196 | 0.5 MB | 15 ms | 0.1 ms |
| 2,000 | 4.7 MB | 68 ms | 0.8 ms |
| 10,000 | 23.3 MB | 289 ms | 3.2 ms |

These are a floor: a tidily packed clone, and front matter read by a regular expression rather
than as YAML. The first download costs more (196 notes: 1.1 s), but happens once, and the clone
keeps it. The file is worth having for `seenCommit`'s tags in step 2, and for other readers; the
time it saves is a bonus.

## Step 1: filter by tag

### What the user sees

In **All files**, **Filter by tag** shows the filter. Selecting it is the first tag use: it shows
"Reading 120 pages…", then a chip per tag.

- **Chips** work as in publictxt-facets: off, included or excluded; **All** / **Any** of the
  included (All at first); excluded always wins.
- **Counts** are of pages within the current filter. The first 20 chips show, plus any set;
  **+n more** shows the rest. A text field narrows the chips.
- **The tree** shows only matching pages. Files that aren't Markdown have no tags and are left
  out while a filter is set.
- **Ticks**: a folder's tick box covers the files shown. Files ticked earlier stay ticked, and
  the buttons say so: **Mirror selected (5, 2 hidden)**.
- **Unread pages**: "12 pages couldn't be read", with **Try again**.

The filter is per source, kept across checks as ticks are, and gone with the view.

### Code

| Part | Where |
|---|---|
| `RemoteHost.blobs()`: contents of many blobs; those it can't read are left out | `src/remote/host.ts`, `git.ts` |
| Runner: stdin and bytes out | `src/remote/git-process.ts` |
| Index files in the clone: read, write, prune | `src/remote/clone-files.ts`; Node part in `git-process.ts` |
| Text → tags | `src/tags/tags.ts` |
| Index: build from an earlier one, what's unread, to and from JSON | `src/tags/tag-index.ts` |
| Filter: match, counts | `src/tags/filter.ts` |
| Working copies, delayed saves, progress | `src/tags/run.ts` |
| Filter row and chips | `src/ui/tag-filter.ts` |

`tags.ts` takes the YAML parser as an argument, so it stays pure.

`blobs()` is `prefetch`, then `cat-file --batch`, in batches that each take the clone's queue, so
a compare or fork can go between. Two things to get right:

- Sizes in the output are in bytes: cut it as bytes, then decode.
- Run it with `GIT_NO_LAZY_FETCH=1`. Otherwise a failed prefetch turns into one fetch per file.
  With it, git prints `<sha> missing`: an unread page.

### Order

1. `blobs()`, and the runner.
2. Tags from text, and the filter.
3. The index: build, then load, save and prune.
4. Split `check-source.ts` (over 300 lines already); no change in behaviour.
5. The filter in **All files**. The view redraws at each click: the text field keeps its focus
   and caret.

### Tests

- **Tags**: the spec's cases; CRLF; a fence that never closes; invalid YAML (inline tags still
  count); NFC and NFD forms of one tag.
- **Filter**: all, any and exclude together; nested tags; counts.
- **Index**: only new contents read; rename; rewritten history; the old commit gone; changed `include`; other `version`; broken JSON;
  partial, then filled in.
- **Git, against temporary repos**: multi-byte text; an empty blob; a missing blob; more than one
  batch.
- **Saving**: nothing written by filtering alone; clone deleted before the save; pruning keeps two.

## Step 2: followed tags

### In the follow note

```yaml
follow_tags:
  - dev obsidian        # both
  - books -fiction      # books, but not fiction
```

- Each line is a **tag combo**: every tag must match, `-` excludes. A page matches when any line
  does. With that, any combination can be written.
- Compared by `match`; tags are kept as written. No `#`: in YAML, ` #` starts a comment. One
  leading a tag is dropped when reading.
- A single string reads as one line. Lines without a tag are ignored.
- Properties edits it as a plain list. It isn't `tags`, which would be the note's own.
- Follow notes are public, so followed tags are too, as `include` is.

It narrows with `include`: a page must be in both. It is what §13 q1 of the spec leaves open, to
be proposed there.

### What the user sees

- **Follow these tags**, beside a set filter, adds it to the note: one line for **All**, one per
  included tag for **Any**, each with the exclusions. Lines already there aren't repeated.
- Saved combos show above the chips; selecting one sets the filter.
- The source form has **Followed tags**, one combo per line, as its other lists are.
- **What's new** lists matching changes first; the rest go under **Other changes (n)**, closed.

The rest is folded, not hidden: **Mark as seen** moves the whole source to head, and shouldn't
acknowledge changes the user had no way to see.

Details:

- A change matches if its old or its new version does, so a page that loses a tag, or is removed,
  still shows. `include` treats renames the same way. Old tags come from `seenCommit`'s index,
  reading only the changed files' old blobs if they aren't in it.
- When every file is listed (first check, history rewritten), only the new version counts.
- A page that can't be read counts as matching.
- Mirrors and forks changed upstream are listed whatever their tags.
- A source with `follow_tags` uses tags at each check, so its checks fetch contents.

### Order

1. `follow_tags`: read, write, form.
2. Matching changes, old and new.
3. **What's new** in two groups.
4. Saved combos in the filter, and **Follow these tags**.

## Docs

| File | Gets |
|---|---|
| `features/tags.md` | New: tags, index, filter, followed tags |
| `features/git.md` | `blobs`, files in the clone |
| `features/check.md` | The filter; the two groups in What's new |
| `features/sources.md` | `follow_tags` |
| `intent.md` | Decision: the index is a cache in the clone, never in notes. Drop "tag filters" from Later |
| `naming.md` | tag index, tag filter, tag combo, followed tags, unread; `src/tags/` |
| `README.md` | Filter and follow tags. Privacy: using tags downloads the pages of the source |

## Later

Not planned. What the design leaves open:

- **Facets** could list remote pages that aren't mirrored, from the index files. They become a
  contract then: `version` is there for that, and they'd need documenting for other readers.
- **Pages** could too, when built on a computer with the clones. They are git-ignored, so a
  hosted build has none.
- **Blobs in the index file** (maybe): saves one `ls-tree` when head moves (20 ms at 10,000 notes),
  lets an index be reused when its commit is gone, and lets another tool match pages by contents
  without running git. Needs a new `version`.
- **Search across sources**: the index and filter don't depend on one source; the view does.
- **Tag aliases** (spec §7.4): tags are stored as written, so aliases can apply when filtering.
- **Ratings per tag**: ADR-0016 puts `rating` on the follow. A list such as
  `tag_ratings: [dev 5, politics 2]` could refine it, with `rating` as the fallback. Open: what a
  page with both tags gets; whether it is public, as follow notes are; and whether a "community"
  is a followed repo or a group of people, which the spec has no place for yet (§13 q9).

## Decisions

| Decision | Instead of | Because |
|---|---|---|
| One file per commit | One file moving between commits | Two commits' tags at once (step 2); any earlier file can seed the next |
| Reuse by blob | A diff between the commits | Rewritten history, branches and renames need nothing special |
| Blobs looked up with `ls-tree` | Stored in the file | The commit already fixes them; they'd be about a third of the file |
| In the clone | `community/.indexes/`; `data.json` | Derived data stays out of the published repo, and out of Sync |
| Contents fetched at first tag use | At each check | Most checks don't need them |
| Filter per source | One across sources | Combos are saved per source; across can come later |
| Combos in the follow note | `data.json` | Follows are notes and carry their own facts |
| `dev -fiction` lines | Pages' `tag=a&tag-not=b` | Reads well in Properties; lines give "or" |
| Other changes folded | Hidden | **Mark as seen** covers them too |
