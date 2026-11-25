# Fork links

A fork sits somewhere else than its page does upstream, so links by path (`../cs/b.md`,
`[[cs/b]]`) would miss. They become links by name (`b.md`, `[[b]]`), which Obsidian finds wherever
the note is. Nothing else about a link changes. Sources are Obsidian vaults or plain Markdown
repos: `[[wikilinks]]` and `[text](path)`. Forks only: a mirror's links stay as written
([mirror.md](mirror.md)).

A link by name lands on the vault's note of that name, or dangles until there is one: the wiki
way, deliberately unguarded. With several copies of a page it goes to the one that has the name.

## Which links

The `links` and `embeds` Obsidian's metadata cache finds in the body, so code, front matter, web
links and plain text are never touched. Of those, the ones with a `/` in their path
(`linkByName()`):

| Upstream reads it as | Becomes |
|---|---|
| A note | The shortest end of its path that upstream reads back as it (`b`, else `cs/b`, …) |
| Nothing: a page not written yet | Its file name, unless upstream reads that as something |
| Several notes, or a file that isn't a note | Left |

Left too: a link no end of the path reads back for (`[b](/cs/b.md)` beside `wiki/cs/b.md`, from
`wiki/a.md`); a Markdown link to nothing without `.md` (perhaps a folder); a name with
`| # ^ [ ]`; a link to nothing upstream that Obsidian finds in the vault (the user's own); a
Markdown link whose path has a bare `)`.

Only the path is replaced: form (wikilink or Markdown), text, alias, `#heading`/`#^block`, title,
`!`, a table's `\|` and the name's case are kept. A second run changes nothing.

## Reading a link

A link is read against the source's files at `fork_commit` (`ls-tree` in the clone, no fetch), as
upstream reads it (`upstreamTarget()`): the target without `#…` / `|…`, URL-decoded, each
candidate tried as is then with `.md`:

- `./`, `../`: relative to `fork_path`'s folder only; `/`: from the root only;
- else Markdown link: relative, root, by name; wikilink: root, relative, by name.

By name: upstream paths equal to or ending in `/<target>`; exactly one resolves. Paths climbing
out of the repo resolve to nothing. Case-insensitive only when no exact match. None: **missing**;
several: **several**.

## When

- After a fork (a mirror that moves too), **Overwrite** and **Write alongside**: the notes just
  written, unasked, with no notice. It waits up to 10 s for the metadata cache to see each; a
  sticky notice names any it couldn't do and why.
- **Convert links in this note** (`convert-links`): the active fork. A notice says how many.

A note is written once (`vault.process`), only if a link changed, and not at all if a cached link
position no longer matches the text. `fork_*` keys are untouched, so `fork_blob` stays the base,
and these links don't count as edits (`matchesExceptLinks()`: links showing the same words, to the
same subpath): **Overwrite** doesn't ask because of them.

## Code

Pure: `src/fork/links.ts`. Vault: `src/fork/links-run.ts`.
