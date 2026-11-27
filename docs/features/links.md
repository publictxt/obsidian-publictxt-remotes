# Links

Links copied from a source were written for upstream, and any note's may not be as the vault
writes them. Two things can be done about them, apart or together (**Fix**):

- **Converting** writes them as the vault writes links: wikilinks or Markdown links (**Use
  [[Wikilinks]]**). Markdown links get a relative path to the note, which publictxt-pages needs
  for now; wikilinks the shortest.
- **Matching** points the broken ones at notes of the vault.

Which note a link is to is Obsidian's call (`getFirstLinkpathDest`): the plugin never picks
between notes of the same name.

Neither looks at the source. Built for forks, but the commands work on any note, mirrors too:
neither is an edit, so the mirror's next update overwrites it unasked, in upstream's form
([mirror.md](mirror.md)).

**Which links**: the `links` and `embeds` Obsidian's metadata cache finds in the body, so code,
front matter and plain text are never touched. Of those, links to notes (`notePath()`): not web
links, links within the note, other files, or Markdown links without `.md` (perhaps a folder).

## Converting

Each link is written to the note Obsidian finds by it, by the path `rewriterFor()` gives:

- **To Markdown links**: the path relative to the note (`relativePath()`): `[[Obsidian]]` →
  `[Obsidian](../x/Obsidian.md)`.
- **To wikilinks**: the shortest, as `fileToLinktext` gives it: the name when only one note has
  it, else the path from the vault's root.

A link already in the vault's form is rewritten too when its path isn't that one. **New link
format** isn't followed.

A link to no note keeps its path and changes form only (`reformat()`): `[[../cs/b|see]]` ↔
`[see](../cs/b.md)`. Either way the shown words, `#heading`/`#^block` and `!` are kept; a
wikilink gets an alias only when it would show something else, its `|` escaped in a table.

Left: one in that form already, by that path; one the other form can't hold (a title, words that
can't be an alias or a link's text); a Markdown link with a bare `)` in its path; a path with
`| # ^ [ ]`; an alias with `]`.

## Matching

A link is broken when Obsidian finds no note by it. It is pointed at the note Obsidian finds by its file name
alone, without folder or `.md` (`relink()`), by the path converting gives, in the vault's form.
None: left. Of several notes of that name, Obsidian's pick, which may not be the page upstream
meant. A link that works is never touched.

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
  says how many were matched, and how many have no note of their name. Fixing matches the broken
  links and converts the rest.

A note is written once (`vault.process`), only if a link changed, and not at all if a cached link
position no longer matches the text. The link under the cursor is rewritten in the editor, so it
can be undone; it counts only if the cache still has it where the editor does, and a notice says
why it was left. `fork_*` keys are untouched, so `fork_blob` stays the base, and links changed so
don't count as edits ([fork-update.md](fork-update.md)).

## Code

Pure: `src/links/links.ts`, `src/copy/link-text.ts`. Vault: `src/links/rewrite-run.ts` (what a link becomes),
`src/links/run.ts` (the note, after a fork), `src/links/cursor-run.ts` (the link under the cursor).
