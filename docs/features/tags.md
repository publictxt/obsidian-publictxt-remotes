# Tags

Finding a source's pages by tag, though they aren't in the vault, and following a source's tags.

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

The tag part of the check view's [filter](check.md#filter), which narrows **What's new** and
**All files**. Its first use reads the source's tags ("Reading 120 pages…").

- **Chips** as in publictxt-facets: a chip includes or clears its tag, its **✕** excludes or
  clears it. **All** / **Any** of the included, once two are; excluded always wins.
- **Counts** are of pages at head that would pass. Chips are ordered by use, so they stay put;
  the first 20 show, **+n more** the rest, and **Find a tag** narrows them.
- **The lists** show only pages that pass, with "n of m" counts. Non-Markdown files are left out.
- **What's new** lets news through when in doubt: removed pages, and pages that couldn't be
  read.
- **Unread pages** are reported, with **Try again**.
- **Followed:** the source's followed tags, above the chips; selecting one sets the filter to it,
  and again clears it.
- **Follow these tags**, while the filter is set to something not followed yet, adds it to the
  follow note: one line for **All**, one per included tag for **Any**, each with the exclusions.
  Lines already there aren't repeated. The last check is matched again at once.

Kept as the rest of the filter is ([check.md](check.md#filter)).

## Tag index

Tags are in file contents, and clones don't hold contents up front ([git.md](git.md)). They are
fetched at the first tag use for a source, never by a check alone, unless it has followed tags. What was read is kept:

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

Another commit's index is reused by blob (its paths, through `ls-tree` of that commit), so only
contents not seen before are read. If that commit is gone, everything is read.

**Saving.** Memory is the working copy; the file is written later, only if something was read,
and filtering never waits for it. Only head's and `seenCommit`'s files are kept.

At 10,000 notes, building from nothing takes about 3 s and loading the file about 20 ms.

## Followed tags

A follow note's `follow_tags` ([sources.md](sources.md)) holds tag combos: `dev obsidian` needs
both, `books -fiction` leaves fiction out, and a page matches when any line does. Compared by
`match`, nested as in the filter. No `#`: in YAML, ` #` starts a comment. Properties edits it as a
plain list; it isn't `tags`, which would be the note's own. Follow notes are public, so followed
tags are too, as `include` is. It narrows with `include`: a page must be in both. It is what §13
q1 of the spec leaves open, to be proposed there.

Set in the source form (**Followed tags**, one combo per line), or from the filter (above).

At each check of a source with followed tags, each change is matched (`SourceCheck.followed`):

- By its version at head or the one at `seenCommit`, so a page that loses a tag, or is removed,
  still matches. A rename's old version is at its old path.
- When every file is listed (first check, history rewritten), only the version at head counts.
- A page that couldn't be read matches; a file that isn't a page never does.
- Only the changed pages are read, from the tag index of head and of `seenCommit`; the filter
  reads the rest when it is opened.

**What's new** lists the changes that match, and folds the rest under **Other changes**
([check.md](check.md)). Mirrors and forks changed upstream are listed whatever their tags.

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
| Filter per source | One across sources | Combos are saved per source; across can come later |
| Combos in the follow note | `data.json` | Follows are notes and carry their own facts |
| `dev -fiction` lines | Pages' `tag=a&tag-not=b` | Reads well in Properties; lines give "or" |
| Other changes folded | Hidden | **Mark as seen** covers them too |

## Code

Pure: `src/tags/tags.ts` (text → tags), `filter.ts`, `tag-index.ts` (the file), `tag-indexes.ts`
(getting and saving), `follow.ts` (matching changes), `combo.ts` (`follow_tags` lines),
`src/remote/clone-files.ts`, `cat-file.ts`. Vault: `src/tags/run.ts`. UI:
`src/ui/filter-panel.ts`, `keep-focus.ts`.
