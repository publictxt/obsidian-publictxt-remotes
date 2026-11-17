# Mirror links

A short account of what happens to a mirror's links. The full rules are in `docs/spec.md` →
Convert links; the reasons are decision 6 in `docs/plans/convert-links.md`.

## The rule

A mirror links only into its own mirror folder. Each link that upstream reads as one note is
rewritten by full path to where that note's mirror is, or would be:
`<mirror folder>/<upstream path>`. The mirror folder is the mirror's vault path less its
upstream path, so `community/txt/wiki/a.md` mirroring `wiki/a.md` gives `community/txt`.

From `community/txt/wiki/a.md`, with upstream files `wiki/c.md`, `wiki/cs/b.md`, `cs/b.md`
and `top.md`:

| Upstream wrote | Becomes |
|---|---|
| `[[cs/b]]` | `[[community/txt/cs/b]]` |
| `[[c\|see c]]` | `[[community/txt/wiki/c\|see c]]` |
| `![[c#H]]` | `![[community/txt/wiki/c#H]]` |
| `[b](cs/b.md)` | `[b](community/txt/wiki/cs/b.md)` |
| `[t](../top.md)` | `[t](community/txt/top.md)` |
| `[b](/cs/b.md)` | `[b](community/txt/cs/b.md)` |

A link keeps its own form: a wikilink stays a wikilink and a Markdown link stays a Markdown
link. It also keeps what it shows, its `#heading` or `#^block`, and its `!`. Mirrors are not
restyled to the vault's link format.

## What it gives

- **Links between a source's mirrors work**, by path, never by name.
- **A link to a page not mirrored dangles** where its mirror would be. Obsidian doesn't match a
  full path by name, so it never lands on the user's own note of that name. Once the page is
  mirrored, the link works with nothing rewritten.
- **Relative links are safe.** Obsidian reads a bare path from the vault root, not from the
  note, so relative links get the full path too.

## Left as written

- Links to no file upstream, or to several files of that name.
- Links to files that aren't notes, such as images.
- Web links, and links within the note.
- Every link in a mirror moved by hand out of its mirror folder.

None of these is counted, or listed in the follow note's **Links to fix** or **Links to
check**. Mirrors are never in those sections.

## When

Unasked, after **Mirror** (any way in) and after **Update** or **Update mirrors**, for the
mirrors just written. A mirror is upstream's, with no edits to respect, and an update
overwrites it anyway. The commands **Convert links in this note** and **Convert links in every
fork and mirror** also cover mirrors.

What a mirror's links become doesn't depend on what else is in the vault, so no other note is
touched. Converted links don't count as edits, so **Update** doesn't ask because of them.

## Reading the source

Turning a link into its upstream file needs the source's file list: `[[b]]` means whichever
upstream file ends in `b.md`, and only one match is rewritten. After mirroring, it is the
tree mirroring already read at head. After an update, it is read once from the local clone
at the head the check saw (`git ls-tree`, no fetch). Nothing else is read: no vault scan, no
other notes. The commands go through the general converter instead, which reads the tree at
the mirror's `mirror_commit`, and falls back to the paths of the source's copies in the vault
when that commit is gone from the clone.

## Edge cases

- **A page that is forked, not mirrored.** A mirror's link to it dangles: a mirror links only
  to mirrors.
- **Forking a mirror.** The mirror moves, and Obsidian updates the full-path links to it in
  the other mirrors. The next update of those mirrors points them back into the mirror folder.

## Not done

- **A per-source switch.** With this rule there is little to opt out of.
- **Links to the original repo** for pages not mirrored. A local source has no URL, a web link
  leaves Obsidian's graph, and it couldn't convert back once the page is mirrored. Rendering an
  unresolved link in a mirror as a link to the original belongs to publictxt-pages, from
  `mirror_repo` and the page path.

## Code

`mirrorRoot()` and `mirrorLink()` in `src/fork/links.ts` are pure, with tests in
`tests/links.test.ts`. The vault side is `convertMirrors()` in `src/fork/links-run.ts`,
called from `src/mirror/run.ts`.
