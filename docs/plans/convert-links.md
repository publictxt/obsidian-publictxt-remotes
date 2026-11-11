# Convert links: design and implementation plan

A brief for whoever implements it. It is self-contained, but read `AGENTS.md`, `docs/spec.md`
(→ Fork provenance, Fork, Fork update, Fork list) and `docs/naming.md` first.

> Not built. The five decisions below are proposals: confirm or change them before starting.

## Context

A fork is an upstream file's text, copied as it is. Its links were written for the upstream
repo: `[sorting](../cs/algorithms.md)` is relative to where the file sits there, and
`[[algorithms]]` names a file there. In the vault the note sits somewhere else, under a name
the user may have changed, so those links are broken or, worse, land on an unrelated note of
the same name. And they are in upstream's link style, which may not be the vault's (wikilinks
or Markdown links, shortest, relative or absolute paths).

This work rewrites a fork's links to other upstream files so that they point at the vault's
copies of those files, written in the vault's own link format.

## Decisions to confirm

1. **Only links whose target is forked are converted.** A link to an upstream file with no
   copy in the vault is left exactly as it is, and counted. It is converted later, once that
   file is forked. Nothing is turned into a web URL, and nothing is forked for the user.
2. **Offline: targets are worked out from `fork_path`, not from the upstream tree.** A
   Markdown link is path arithmetic from the note's `fork_path`; a wikilink is matched against
   the `fork_path`s of the source's forks. No fetch, so it is instant and can run over every
   fork. The cost: a bare `[[name]]` is matched only against files already forked (see
   Resolving).
3. **Obsidian writes the link** (`fileManager.generateMarkdownLink`, as the fork list does), so
   the result follows **Settings → Files and links** without the plugin knowing the rules.
4. **A converted link is not an edit.** The compare's "Your copy is edited" test passes a note
   that matches the version at `fork_blob` except for link format (`matchesExceptLinks()`).
   Otherwise every converted fork would read as edited and **Overwrite** would always ask.
5. **It is an option, and goes quiet by itself.** A link is rewritten only when what Obsidian
   would write differs from what is there. In a vault and a source that both use
   `[[wikilinks]]` by name, that is almost never: only for a copy under another name, or a
   name that lands on the wrong note. So the option can stay when PublicTxt moves to
   wikilinks.

## The design

### Which links

In the note's body, the links and embeds Obsidian itself finds (`metadataCache.getFileCache()`:
`links` and `embeds`). So links in code, external URLs and plain text are never touched, and
there is no second Markdown parser to disagree with Obsidian's. Not converted in this work:
links in front matter, and Markdown links with a title (`[a](b.md "title")`).

### Resolving a link

For a note forked from `fork_path` in a source, each link goes through this, in order:

1. **Already local.** If Obsidian resolves the link from the note (`getFirstLinkpathDest`) to
   a copy from the same source, that copy is the target. This is what makes a second run
   change nothing.
2. **Its upstream path.**
   - Markdown link: the href, URL-decoded, without its `#…`; relative to the folder of
     `fork_path`, or to the repo root when it starts with `/`. `.md` is added when there is no
     extension. A path that climbs out of the repo is unresolved.
   - Wikilink: the target without `#…` and `|…`, `.md` added. Among the upstream paths this
     source has forks of: the one equal to it, else those ending in `/` + it. Exactly one
     match resolves; none or several is unresolved. Compared without case.
3. **Its copy.** The latest copy (`latestFirst()`) of that upstream path from the same source
   (`forksOf()`). No copy: unresolved.
4. **Unclear.** If step 1 found a copy and steps 2–3 find a different upstream file's copy,
   the link is left alone and counted as unclear. The plugin never guesses.

A link to the note's own upstream path resolves to the note itself, not to another copy.

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
- **Convert links in every fork** (`convert-links-all`): every fork of every followed source.
  One notice: "Converted 12 links in 5 notes."
- **Convert links when forking** (setting `convertLinks`, off by default): after a fork is
  written (one, several, or **Write alongside**) and after **Overwrite**, every fork of that
  source is converted. Every fork, not just the new note, so older forks pick up their links
  to it, and files forked together link to each other. The fork's own notice gains
  "4 links converted." when any were.

The metadata cache lags a write. After forking, wait for the note's
`metadataCache.on('changed')` before converting, giving up after 2 seconds: the links then
stay as they are and the command can be run later.

### The edited test

`fork_blob` is the reference and conversion never moves it: it stays the upstream blob the
text came from, so the forked version can always be fetched and compared with. `fork_seen` is
not involved: it records upstream versions dealt with, nothing about the note's own text.

`matchesExceptLinks(note, forked, sameLink)` (pure) is the body half of `isEdited()`. One
regular expression cuts each body into text and links (`[[…]]`, `[…](…)`, with or without
`!`). The bodies match when the text pieces are equal one for one, there are as many links,
and each pair of links is the same text or `sameLink(noteLink, forkedLink)` holds. The same
pass runs on both sides, so it needn't know about code blocks.

`sameLink`, from the vault side: both show the same words, keep the same `#…`, and the note's
link resolves in the vault to a copy of the upstream file the forked link names (Resolving,
above). So a link that was retargeted by hand is still an edit; only a faithful conversion
passes. With the vault unavailable (tests), `sameLink` defaults to "shows the same".

### Not in this work

- Links to files that aren't forked: making them web links to the host, or offering to fork.
- Checking a wikilink against the upstream tree (it would tell an ambiguous name from a unique
  one, at the cost of a fetch).
- Images and other non-Markdown targets: they can't be forked, so they never resolve.
- Converting back to upstream's form, for proposing a change upstream.
- Links in front matter; restyling links that were never upstream's.

## How to build it

Pure module and Obsidian side, as elsewhere.

### 1. Pure logic: `src/fork/links.ts`, `tests/links.test.ts`

- `LinkRef`: `{ start, end, original, link, embed }`, as the cache gives them (`link` is the
  target with its subpath, decoded).
- `upstreamTarget(ref, forkPath, forkedPaths)`: the upstream path a link names, or `null`
  (step 2 of Resolving). `splitLink(link)`: path and subpath.
- `linkShows(original)`: what a link shows.
- `convertLinks(text, refs, plan)`: `plan(ref)` returns the new link text, `null` to leave it
  (`'unforked'`, `'unclear'`). Returns `{ text, converted, unforked, unclear }`, or `null` when
  a position doesn't match. Splices from the last link back so offsets stay true.

Test at least: `../`, `/`-rooted, encoded spaces, no extension, out of the repo; wikilink by
full path, by name, ambiguous, different case; subpath kept; alias only when needed; embed
kept; a stale position; a second run changes nothing.

### 2. The vault side: `src/fork/links-run.ts`

- `convertNote(app, file, meta, forks)`: refs from the cache, the local resolution (step 1),
  `generateMarkdownLink`, `vault.process`. Returns the counts.
- `convertSource(app, remote)` and `convertAll(app)`: over `scanForks()`, scanned once.
- `convertActiveFork(app)`: the command, with its notices.
- `whenCached(app, file, ms)`: the wait described above.

Register both commands in `src/main.ts`.

### 3. The edited test (`src/fork/update.ts`, `tests/update.test.ts`)

`matchesExceptLinks()` in `src/fork/links.ts`; `isEdited()` takes an optional `sameLink` and
uses it for the bodies, after the line-ending and leading-blank-line rule it has now.
`loadCompare()` passes the vault's `sameLink`. Tests: a converted note is not edited; a
changed link text, an added link, a retargeted link and changed text beside a link are.

### 4. The setting, and forking (`src/sources/schema.ts`, `src/settings.ts`, `src/fork/run.ts`, `src/fork/update-run.ts`)

`convertLinks: boolean` in `PublicTxtData` and `normalizeData()`, default `false`; a toggle
under the fork settings. Call `convertSource()` at the end of `forkOne()`, `forkSeveral()`,
`overwrite()` and `writeAlongside()` when it is on. A failure there is a notice; the fork
stands.

### 5. Docs, with the code they describe

- `docs/spec.md`: a **Convert links** section after Fork update; the setting in **Data**; a
  line in **Fork** and **Fork update**; the edited rule; **Build order**.
- `docs/intent.md`: the four decisions, dated.
- `docs/naming.md`: the command ids and the new names.
- `README.md`: a bullet, the commands table, the settings table.

## Working rules

As in `docs/plans/fork-update.md`: branch `feat/convert-links` from `feat/fork-update`; small
commits titled `Area: what changed`; no new dependencies; no Node imports; before each commit
`npm run build`, `npm run lint`, `npm test`; don't push; no AI attribution lines.

## Checking it by hand

With a local source holding `wiki/a.md` (links to `cs/b.md` as a Markdown link, to `c` as a
wikilink, to `cs/b.md#Heading`, and embeds `c`) and `wiki/cs/b.md`, `wiki/c.md`:

1. Fork `a` only: the command says nothing was converted and counts the links left.
2. Fork `b` and `c` into another folder, `c` under a new name: the command converts all four;
   each opens the right note; the heading link lands on the heading; the renamed one keeps
   its words.
3. Run it again: "No links to convert."
4. Switch **Use \[\[Wikilinks\]\]** off, then the link format to relative: newly converted
   links follow each.
5. Compare `a` with upstream after converting: "Your copy is as you forked it."
6. Turn the setting on and fork three linked files at once: they link to each other with no
   command run. **Overwrite** and **Write alongside** leave converted links.
7. A link inside a code block, and an external URL, are untouched.
