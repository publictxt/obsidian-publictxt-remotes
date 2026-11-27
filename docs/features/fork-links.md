# Fork links

A fork's links were written for upstream. Two things can be done about them, apart:

- **Converting** writes them as the vault writes links: wikilinks or Markdown links (**Use
  [[Wikilinks]]**). Their paths stay, so where they go is Obsidian's business: the wiki way.
- **Matching** points the broken ones at notes of the vault.

Neither looks at the source. Built for forks, but the commands work on any note, mirrors too:
neither is an edit, so the mirror's next update overwrites it unasked, in upstream's form
([mirror.md](mirror.md)).

**Which links**: the `links` and `embeds` Obsidian's metadata cache finds in the body, so code,
front matter and plain text are never touched. Of those, links to notes (`notePath()`): not web
links, links within the note, other files, or Markdown links without `.md` (perhaps a folder).

## Converting

`reformat()`: `[[../cs/b|see]]` ↔ `[see](../cs/b.md)`. The path, the shown words,
`#heading`/`#^block` and `!` are kept; a wikilink gets an alias only when it would show something
else, its `|` escaped in a table. Not followed: **New link format** (shortest, relative, absolute).

Left: one in that form already; one the other form can't hold (a title, words that can't be an
alias or a link's text); a Markdown link with a bare `)` in its path; a path with `| # ^ [ ]`; an
alias with `]`.

Paths hold up when forks keep the source's folders. Into one folder, links by name work and most
others don't.

## Matching

A link is broken when Obsidian finds nothing by it (`getFirstLinkpathDest`). One note in the vault
of its file name, without folder, `.md` or case (`nameOf()`): the link is pointed at it
(`relink()`), by the path the vault's settings give (`fileToLinktext`), in its form. None or
several: left. A link that works is never touched, even if it goes to another page than upstream
meant. A match by name may not be the page upstream meant either.

## When

- **After a fork** (a mirror that moves too): the notes just written, by the modal's **Convert
  links** (on each time) and **Match links to existing pages** (off each time); with both off,
  links stay as upstream wrote them. After **Overwrite** and **Write alongside**: converted, not
  matched. It waits up to 10 s for the metadata cache to see each; a sticky notice names any it
  couldn't do and why.
- **Commands**, each on the active note (mirrors too), or on the link under the cursor:

  | Work | This note | Link under cursor |
  |---|---|---|
  | Convert | **Convert links in this note to the vault's link format** (`convert-links`) | **Convert link under cursor to the vault's link format** (`convert-link-at-cursor`) |
  | Match | **Match links in this note** (`match-links`) | **Match link under cursor** (`match-link-at-cursor`) |
  | Both | **Fix links in this note (convert and match)** (`fix-links`) | **Fix link under cursor (convert and match)** (`fix-link-at-cursor`) |

  Converting goes either way, as **Use [[Wikilinks]]** says, and the notice names which. Matching
  says how many were matched, have several matches, or have none. Fixing matches the broken links
  and converts the rest.

A note is written once (`vault.process`), only if a link changed, and not at all if a cached link
position no longer matches the text. The link under the cursor is rewritten in the editor, so it
can be undone; it counts only if the cache still has it where the editor does, and a notice says
why it was left. `fork_*` keys are untouched, so `fork_blob` stays the base, and links changed so
don't count as edits ([fork-update.md](fork-update.md)).

## Code

Pure: `src/fork/links.ts`, `src/copy/link-text.ts`. Vault: `src/fork/links-run.ts`, `src/fork/link-cursor-run.ts`.
