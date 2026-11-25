# Fork links

A fork's links were written for upstream: for where the page sat there, in upstream's style. They
are converted to the vault's own: pointed at its copies, as its settings write links (**Use
[[Wikilinks]]**, **New link format**). Sources are Obsidian vaults or plain Markdown repos:
`[[wikilinks]]` and `[text](path)`. Forks only: a mirror's links stay as written
([mirror.md](mirror.md)).

**Which links**: the `links` and `embeds` Obsidian's metadata cache finds in the body, so code,
front matter, web links and plain text are never touched.

## Where a link goes

| Upstream reads it as | Becomes a link to |
|---|---|
| The note itself | The note |
| A page with a copy in the vault | The copy: its newest fork (`latestFirst()`), else its mirror |
| A page with no copy | Its name: the shortest end of its path upstream reads back as it (`b`, else `cs/b`, …; `shortestName()`) |
| No one page, but the vault has a note there | That note |
| Nothing: a page not written yet | Its file name, unless upstream reads that as something (`missingName()`) |
| A file that isn't a note; anything else | Left |

A link by name lands on the vault's note of that name, or dangles until there is one: the wiki
way, deliberately unguarded. One to a copy has the path the vault's settings give it
(`fileToLinktext`).

**Reading a link** (`upstreamTarget()`): against the source's files at `fork_commit` (`ls-tree` in
the clone, no fetch): the target without `#…` / `|…`, URL-decoded, each candidate tried as is then
with `.md`:

- `./`, `../`: relative to `fork_path`'s folder only; `/`: from the root only;
- else Markdown link: relative, root, by name; wikilink: root, relative, by name.

By name: upstream paths equal to or ending in `/<target>`; exactly one resolves. Paths climbing
out of the repo resolve to nothing. Case-insensitive only when no exact match. None: **missing**;
several: **several**.

## How it is written

`relink()`. The shown words, `#heading`/`#^block` and `!` are kept; an alias is added only when a
wikilink would show something else, its `|` escaped in a table. What the other form can't hold (a
title, words that can't be an alias or a link's text) keeps its form, and only its path changes.
Left: a Markdown link with a bare `)` in its path, a name with `| # ^ [ ]`, an alias with `]`.

## When

- After a fork (a mirror that moves too) unless **Convert links** is off in the modal, and after
  **Overwrite** and **Write alongside** always: the notes just written, with no notice. It waits up
  to 10 s for the metadata cache to see each; a sticky notice names any it couldn't do and why.
- **Convert links in this note** (`convert-links`): the active fork, for pages copied since or
  a fork made with it off. A link Obsidian already finds a copy of this source by stays on that copy. A notice says how many.

A note is written once (`vault.process`), only if a link changed, and not at all if a cached link
position no longer matches the text. `fork_*` keys are untouched, so `fork_blob` stays the base,
and converted links don't count as edits (`matchesExceptLinks()`: links showing the same words, to
the same subpath): **Overwrite** doesn't ask because of them.

## Code

Pure: `src/fork/links.ts`. Vault: `src/fork/links-run.ts`.
