# Convert links: design and implementation plan

A brief for whoever implements it. It is self-contained, but read `AGENTS.md`, `docs/spec.md`
(→ Fork provenance, Fork, Fork update, Fork list) and `docs/naming.md` first.

> Decisions confirmed 2026-11-12. Building on `feat/convert-links`. Built: steps 1, 2 and 4.
> Step 3 is the pure part only (decided 2026-11-12): links count as the same when they show
> the same words; checking where they point in the vault is left out.

## Context

A fork is an upstream file's text, copied as it is. Its links were written for the upstream
repo: `[sorting](../cs/algorithms.md)` is relative to where the file sits there, and
`[[algorithms]]` names a file there. In the vault the note sits somewhere else, under a name
the user may have changed, so those links are broken or, worse, land on an unrelated note of
the same name. And they are in upstream's link style, which may not be the vault's (wikilinks
or Markdown links, shortest, relative or absolute paths).

This work rewrites a fork's links to other upstream files so that they point at the vault's
copies of those files, written in the vault's own link format. Sources are Obsidian vaults or
plain Markdown repos: `[[wikilinks]]` as Obsidian reads them, and `[text](path)` links. Other
wiki dialects (Gollum's `[[text|Page-Name]]`, MediaWiki, Dendron) are not read.

## Decisions

1. **A link to a forked note points to the copy; a link to a note not forked becomes a link by
   name, in the vault's style** (changed 2026-11-12; first, such links were left as they were).
   The same both ways: `[x](cs/b.md)` becomes `[[b|x]]` in a wikilink vault, and `[[b|x]]`
   becomes `[x](b.md)` in a Markdown-link vault. The name is the shortest end of the note's
   upstream path (`b`, `cs/b`, `wiki/cs/b`) that upstream reads back as that note, so once it is
   forked the link converts to the copy. Until then Obsidian takes it by name: it lands on the
   user's note of that name, or dangles. The wiki way. A link already in the vault's style and by
   name (no `./`, `../`, `/`) stays. A link to a note that is no file upstream either (a page
   not written yet) is written by its own name the same way, landing on the user's note of
   that name or dangling. Links to files that aren't notes (images) are left. Nothing
   is turned into a web URL, and nothing is forked for the user; offering to fork the targets
   may come later. The vault's style is read by asking Obsidian for a link to the note itself:
   its setting isn't public API.
2. **What a link means comes from the source; where it points comes from the vault.** A link
   is read as upstream would read it: against the source's files at the fork's
   `fork_commit` (a local `ls-tree` in the clone, which holds every tree; no fetch). Its target
   in the vault is the copy of that upstream file, found by `fork_path`, never a vault note
   that happens to have the same name. When the commit isn't in the clone (history rewritten
   and pruned), the paths of the source's forks stand in for its files.
3. **Obsidian writes the link** (`fileManager.generateMarkdownLink`, as the fork list does), so
   the result follows **Settings → Files and links** without the plugin knowing the rules.
   Converting to wikilinks or to Markdown links is the same code: whichever the vault uses.
4. **A converted link is not an edit.** The compare's "Your copy is edited" test passes a note
   that matches the version at `fork_blob` except for link format (`matchesExceptLinks()`).
   Otherwise every converted fork would read as edited and **Overwrite** would always ask.
5. **Asked, not automatic.** Forking never rewrites links by itself. After a fork, if any fork
   of that source now has links that can be converted, the notice says how many and offers
   **Convert**. Every fork counts, not just the new note: forking `b` is what makes links to
   `b` convertible in notes forked earlier. No setting; an always-convert toggle can be added
   later if the button is always selected. A link is rewritten only when what Obsidian would
   write differs from what is there, so in a vault and a source that both use `[[wikilinks]]`
   by name the offer is rare.

## The design

### Which links

In the note's body, the links and embeds Obsidian itself finds (`metadataCache.getFileCache()`:
`links` and `embeds`). So links in code, external URLs and plain text are never touched, and
there is no second Markdown parser to disagree with Obsidian's. Not converted in this work:
links in front matter, and Markdown links with a title (`[a](b.md "title")`).

### Resolving a link

For a note forked from `fork_path` in a source, with that source's files (decision 2), each
link goes through this, in order:

1. **Already local.** If Obsidian resolves the link from the note (`getFirstLinkpathDest`) to
   a copy from the same source, that copy is the target. This is what makes a second run
   change nothing.
2. **Its upstream path.** The target without `#…` (and a wikilink's `|…`), URL-decoded. Each
   candidate is tried as written, then with `.md` added; the first that is a file upstream
   wins. Candidates, in order:
   - starting with `./` or `../`: relative to the folder of `fork_path` only;
   - starting with `/`: from the repo root only;
   - otherwise, a Markdown link: relative to the folder, then from the root, then by name;
     a wikilink: from the root, then relative to the folder, then by name.

   "By name" is the upstream files whose path ends in `/` + the target, or equals it; exactly
   one resolves. Paths that climb out of the repo resolve to nothing. A case-insensitive match
   is taken only when there is no exact one. A target that is no file upstream is **missing**;
   one that is several by name is **several**. Both become a link by its own name
   (decision 1); several is listed to check.
3. **Its copy.** The latest copy (`latestFirst()`) of that upstream path from the same source
   (`forksOf()`). No copy: a wikilink by name (decision 1), else **unforked**.
4. **A copy already.** If step 1 found a copy from this source, that copy is the target,
   whatever upstream reads the link as. When upstream reads it as several files, or as
   another one, the link is listed to check.

A link to the note's own upstream path resolves to the note itself, not to another copy.
With forks' paths standing in for the files, missing and unforked can't be told apart: both
count as unforked.

### Writing the link

`generateMarkdownLink(target, notePath, subpath, alias)`:

- `subpath` is the link's `#heading` or `#^block`, kept as written.
- What the link **shows** is kept. A link shows its text or alias when it has one, else the
  last part of its target without `.md` (pure: `linkShows()`). The alias is passed only when
  the new link would show something else, so `[[cs/algorithms]]` becomes `[[algorithms]]`,
  and becomes `[[algorithms 1|algorithms]]` when the copy is named `algorithms 1`.
- An embed stays an embed: the `!` is taken from the original, not from what Obsidian returns.
- If the result is the text already there, the link isn't counted as converted.

The note is written with `vault.process()`, once, and only if a link changed. Each link's
cached position is checked against the text first (`text.slice(start, end) === original`); if
any is off, the cache is stale, nothing is written and the note is reported as "changed while
converting; try again".

### When it runs

- **Convert links in this fork** (`convert-links`): the active note, which must be a fork of a
  followed source. Notice: "Converted 4 links. 2 left: not forked." / "No links to convert."
  Links left are counted too, when there are any.
- **Convert links in every fork** (`convert-links-all`): every fork of every followed source.
  One notice: "Converted 12 links in 5 notes."
- **The offer after forking.** After a fork is written (one, several, or **Write alongside**)
  and after **Overwrite**, the plugin counts, without writing, the links in every fork of that
  source that would be converted. When there are some, a notice: "7 links can now point to
  your copies." with a **Convert** button, which converts that source's forks. The notice
  stays until dismissed or used.

The metadata cache lags a write. Before counting, wait for each new note's
`metadataCache.on('changed')`, giving up after 2 seconds: then there is no offer, and the
commands can be run later.

### The report

Each conversion that writes (either command, or **Convert**) rewrites a **Links to fix** section
in the follow note of each source it covered: every link in every fork of that source that is
left as it was, by note then line, with the link as written (as code, so it isn't a link) and
why. **Convert links in this fork** converts one note but reports them all. The section is
owned like **Forked pages** (`withSection()`, shared with it): from its heading to the next `#`
or `##` heading, removed when nothing is left, and the note left alone with a notice when the
heading appears twice. Follow notes are public, so the section is published with the note.
Links fixed by hand stay listed until the next conversion. Pure: `src/fork/link-report.ts`.

```markdown
## Links to fix

Links in forks of this source that converting left as they were. Rewritten each time links are converted.

- [[a]] line 3: `![p](../img/p.png)` not a note
- [[a]] line 10: `[x](../../out.md)` cannot be converted
```

Why a link is left: **no name fits** (a note not forked that no link by name reads back as),
**not a note** (an image or other file), **cannot be converted** (a note not upstream whose name can't
be a link's, or whose words can't be its text).

The same conversion rewrites a **Links to check** section beside it, owned the same way: the
links converting made a call on, which may not go where upstream meant, by note then line, with
the link as it is now and the call. They stay listed every run until the link is changed by
hand (given a path) or upstream no longer reads it two ways. The notice adds "2 links to check".

```markdown
## Links to check

Links in forks of this source that converting made a call on: they may not go where upstream meant. Rewritten each time links are converted.

- [[a]] line 2: `[[dup]]` several by name
- [[z]] line 5: `[[x]]` kept on your copy
```

The calls: **several by name** (the name is several files upstream, so the link went by its
own name, and lands on your note of that name), **kept on your copy** (the link already
pointed at one of your copies, and upstream reads it as another file). Case-only matches and
links by name to notes you don't have are not listed: the first are nearly always right, the
second are the wiki way.

### The edited test

`fork_blob` is the reference and conversion never moves it: it stays the upstream blob the
text came from, so the forked version can always be fetched and compared with. `fork_seen` is
not involved: it records upstream versions dealt with, nothing about the note's own text.

`matchesExceptLinks(note, forked, sameLink)` (pure) is the body half of `isEdited()`. One
regular expression cuts each body into text and links (`[[…]]`, `[…](…)`, with or without
`!`). The bodies match when the text pieces are equal one for one, there are as many links,
and each pair of links is the same text or `sameLink(noteLink, forkedLink)` holds. The same
pass runs on both sides, so it needn't know about code blocks.

`sameLink`: both links show the same words (`linkShows()`). A link retargeted by hand while
keeping its words passes; the side-by-side compare shows it. Checking where the note's link
points in the vault (a copy of the upstream file the forked link names) is left for later.

### Not in this work

- Offering to fork the notes that dangling links name; making them web links to the host.
- Other wiki dialects; a per-source link style.
- Images and other non-Markdown targets: they can't be forked, so they never resolve.
- Converting back to upstream's form, for proposing a change upstream.
- Links in front matter; restyling links that were never upstream's.
- A setting to convert on fork without asking.

## How to build it

Pure module and Obsidian side, as elsewhere.

### 1. Pure logic: `src/fork/links.ts`, `tests/links.test.ts`

- `LinkRef`: `{ start, end, original, link, embed }`, as the cache gives them (`link` is the
  target with its subpath, decoded).
- `splitLink(link)`: path and subpath. `isWikilink(original)`.
- `upstreamTarget(ref, forkPath, files)`: the upstream path a link names, or why not
  (`'missing'`); step 2 of Resolving. `files` is a set of upstream paths.
- `linkShows(original)`: what a link shows.
- `convertLinks(text, refs, plan)`: `plan(ref)` returns the new link text, or why it is left
  (`'unforked'`, `'not-note'`, `'unconvertible'`; `null`: it is right as it is). Returns
  `{ text, converted, dangling, left: { unforked, not-note, unconvertible }, leftLinks }`, or `null` when a position doesn't
  match. Splices from the last link back so offsets stay true.

Test at least: `../`, `/`-rooted, encoded spaces, no extension, a name with a dot, out of the
repo; Markdown link relative before root, wikilink root before relative; by name, several by name,
different case; subpath kept; alias only when needed; embed kept; a stale position; a second
run changes nothing.

### 2. The vault side: `src/fork/links-run.ts`

- `SourceLinks`: one source's forks, and its files at each `fork_commit` (`host.tree()`, which
  takes any tree-ish: a commit's SHA lists its tree), or the forks' paths when that fails.
  One read per source and commit. `convertNote(file, meta, write)`: refs from the cache, the
  local resolution (step 1), `generateMarkdownLink`, and with `write` `vault.process`. Without
  `write` it is the count for the offer.
- `convertForks(app, host, remotes, write, only?)`: over `scanForks()`, scanned once.
- `convertActiveFork(app, data)`, `convertAllForks(app, data)`: the commands, with their notices.
- `offerConvert(app, host, remote, written)`: waits for `written` to be cached (`whenCached`),
  counts, and shows the notice with **Convert**.

Register both commands in `src/main.ts`.

### 3. The edited test (`src/fork/update.ts`, `tests/update.test.ts`)

`matchesExceptLinks()` in `src/fork/links.ts`; `isEdited()` takes an optional `sameLink` and
uses it for the bodies, after the line-ending and leading-blank-line rule it has now.
Tests: a converted note is not edited; changed link words, an added link and changed text
beside a link are.

### 4. The offer (`src/fork/run.ts`, `src/fork/update-run.ts`)

Call `offerConvert()` at the end of `forkOne()`, `forkSeveral()`, `overwrite()` and
`writeAlongside()`, with the notes written. A failure there is ignored (logged): the fork
stands and the commands remain.

### 5. Docs, with the code they describe

- `docs/spec.md`: a **Convert links** section after Fork update; a line in **Fork** and
  **Fork update** about the offer; the edited rule; **Build order**.
- `docs/intent.md`: the five decisions, dated.
- `docs/naming.md`: the command ids and the new names.
- `README.md`: a bullet and the commands table.

## Working rules

As in `docs/plans/fork-update.md`: branch `feat/convert-links` from `master`; small commits
titled `Area: what changed`; no new dependencies; no Node imports; before each commit
`npm run build`, `npm run lint`, `npm test`; don't push; no AI attribution lines.

## Checking it by hand

With a local source holding `wiki/a.md` (links to `cs/b.md` as a Markdown link, to `c` as a
wikilink, to `cs/b.md#Heading`, to `nowhere`, and embeds `c`) and `wiki/cs/b.md`, `wiki/c.md`:

1. Fork `a` only: no offer. The command says nothing was converted, 4 left not forked and 1
   missing.
2. Fork `b` and `c` into another folder, `c` under a new name: the notice offers 4 links;
   **Convert** converts them; each opens the right note; the heading link lands on the
   heading; the renamed one keeps its words.
3. Run the command again: "No links to convert."
4. Switch **Use \[\[Wikilinks\]\]** off, then the link format to relative: newly converted
   links follow each.
5. Compare `a` with upstream after converting: "Your copy is as you forked it."
6. Fork three linked files at once: one offer covers their links to each other. **Overwrite**
   and **Write alongside** offer too.
7. A link inside a code block, and an external URL, are untouched.
8. A vault note named `c.md` that isn't a fork: `[[c]]` in `a` never converts to it.
