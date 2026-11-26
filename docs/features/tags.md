# Tags

Finding a source's pages by tag, though they aren't in the vault, and following a source's tags.
The rest of followed tags is [planned](../plans/tags.md).

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

In a source of the [check view](check.md), **Filter by tag** shows the filter above **What's
new** and **All files**, and narrows both. Its first use reads the source's tags ("Reading 120
pages…").

- **Chips** as in publictxt-facets: a chip includes or clears its tag, its **✕** excludes or
  clears it. **All** / **Any** of the included, once two are; excluded always wins.
- **Counts** are of pages at head that would pass. Chips are ordered by use, so they stay put;
  the first 20 show, **+n more** the rest, and **Find a tag** narrows them.
- **The lists** show only pages that pass, with "n of m" counts. Non-Markdown files are left out.
- **What's new** lets news through when in doubt: removed pages, and pages that couldn't be
  read. Mirrors and forks changed upstream aren't filtered.
- **Hidden but still counted**: **Mark as seen** acknowledges hidden changes too, and says so;
  files ticked earlier stay ticked, and the buttons count them.
- **Unread pages** are reported, with **Try again**.

Per source; kept across checks as ticks are, and gone with the view. **Hide tag filter** keeps
what is set and stops applying it.

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
`match`, nested as in the filter.

At each check of a source with followed tags, each change is matched (`SourceCheck.followed`):

- By its version at head or the one at `seenCommit`, so a page that loses a tag, or is removed,
  still matches. A rename's old version is at its old path.
- When every file is listed (first check, history rewritten), only the version at head counts.
- A page that couldn't be read matches; a file that isn't a page never does.
- Only the changed pages are read, from the tag index of head and of `seenCommit`; the filter
  reads the rest when it is opened.

Mirrors and forks changed upstream are listed whatever their tags.

## Code

Pure: `src/tags/tags.ts` (text → tags), `filter.ts`, `tag-index.ts` (the file), `tag-indexes.ts`
(getting and saving), `follow.ts` (matching changes), `combo.ts` (`follow_tags` lines),
`src/remote/clone-files.ts`, `cat-file.ts`. Vault: `src/tags/run.ts`. UI:
`src/ui/tag-filter.ts`, `keep-focus.ts`.
