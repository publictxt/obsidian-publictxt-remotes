# Tags

Finding a source's pages by tag, though they aren't in the vault. Followed tags are
[planned](../plans/tags.md).

## What is a tag

The publictext spec's rules (§7):

- **From**: front matter `tags` (a list, or one string; a leading `#` stripped), then inline
  `#tags` in the body. Front matter that isn't valid YAML, or isn't a mapping, has none.
- **Inline**: `#` at the start of a line or after whitespace, then Unicode letters (with their
  combining marks), digits, `_`, `-`, `/`, at least one not a digit. Not in fenced code or inline
  code.
- **Compared** by `match`: Unicode NFC, then lower case. Kept as written (publictext ADR-0006).
- **Nested**: `dev` matches `dev` and `dev/app`, included or excluded, as in Obsidian and
  publictxt-pages. Parents are worked out when filtering, not kept.

Obsidian's metadata cache isn't used: it knows only the vault.

## Filter

In **All files** of the [check view](check.md), **Filter by tag** shows the filter. Selecting it
is the first tag use: it shows "Reading 120 pages…", then a chip per tag.

- **Chips** as in publictxt-facets: off, included or excluded. A chip includes its tag or clears
  it; its **✕** excludes it or clears it. **All** / **Any** of the included (**All** at first),
  offered once two are; excluded always wins. **Clear** clears all.
- **Counts** are of pages that pass; for **Any**, where including more adds pages, of those the
  included tags don't narrow. Order is by use over all pages, so chips stay put.
- The first 20 chips show, and any that are set; **+n more** shows the rest. **Find a tag**
  narrows them.
- **The tree** shows only pages that pass; files that aren't Markdown have no tags and are left
  out while a filter is set. Folders start open when 200 or fewer are left.
- **Ticks**: a folder's tick box covers the files shown. Files ticked earlier stay ticked, and the
  buttons say so: **Mirror selected (5, 2 hidden)**.
- **Unread pages**: "12 pages couldn't be read.", and **Try again**. They match nothing.

Per source; kept across checks as ticks are, and gone with the view. **Hide tag filter** keeps
what is set and stops applying it.

## Tag index

Tags are in file contents, and clones don't hold contents up front ([git.md](git.md)). They are
fetched at the first tag use for a source, never by a check alone. What was read is kept:

```
<clonesFolder>/<host>/<owner>/<repo>.git/publictxt/tags-<commit>.json
```

```json
{ "version": 1, "files": { "wiki/Plain text.md": ["PlainText", "dev/app"], "wiki/Untagged.md": [] } }
```

- `files` holds the Markdown files read, untagged ones too.
- `version` covers the format and the tag rules. Another version's file is ignored.
- A Markdown file at that commit, within `include`, that isn't in `files` is **unread**. So a
  partial index is valid, and a changed `include` needs nothing special.

It is in the clone because it is made from it and goes with it. Git leaves folders it doesn't know
alone.

**Getting one**, for a commit:

| Found | Read | Saved after |
|---|---|---|
| In memory | Nothing | No |
| That commit's file | The file | No |
| Another commit's, in memory or a file | It, and the contents it lacks | Yes |
| Nothing usable | Every Markdown file within `include` | Yes |
| Some contents can't be read (offline) | What can be; the rest at the next use | Yes, without them |

Another commit's index is reused by blob: its file gives path → tags, `ls-tree` of its commit
path → blob, so together blob → tags. Only head's blobs not among them are read. So an edit, a
rename, a branch change, **Local** / **Remote** and rewritten history all need only contents not
seen before. If that commit is gone, everything is read. The file
holds no blobs: the commit already fixes them.

**Saving.** Memory is the working copy. The file is written three seconds after indexing settles,
at an idle moment, and only if something was read. Filtering never writes, nor waits for a write.

- Written to a temporary name, then renamed.
- A save makes `publictxt/`, not the clone's folder: a clone deleted meanwhile stays deleted.
- After a save only head's and `seenCommit`'s files stay; memory keeps the same two.
- Unload drops a pending save: at worst the index is built again.

**Cost**, with a real repo's notes copied up to size, contents already in the clone:

| Notes | Build from nothing | Load the file | File |
|---|---|---|---|
| 199 | 70 ms | 2 ms | 10 KB |
| 2,000 | 0.5 s | 5 ms | 0.1 MB |
| 10,000 | 3 s | 20 ms | 0.5 MB |

Downloading the 199 notes took under a second, once.

## Code

Pure: `src/tags/tags.ts` (text → tags), `filter.ts`, `tag-index.ts` (the file), `tag-indexes.ts`
(getting and saving), `src/remote/clone-files.ts`, `cat-file.ts`. Vault: `src/tags/run.ts`. UI:
`src/ui/tag-filter.ts`, `keep-focus.ts`.
