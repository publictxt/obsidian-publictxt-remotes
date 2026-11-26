# Plan: followed tags

Status: step 1, the tag filter and the tag index, is built: [tags.md](../features/tags.md). Step 2,
here, is under way (Order 1 to 3 are built); this plan goes when it is built.

## Followed tags

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

`features/tags.md`: followed tags. `check.md`: the two groups in What's new. `sources.md`:
`follow_tags`. `naming.md`: tag combo, followed tags. `intent.md`: drop it from Later. `README.md`.

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
