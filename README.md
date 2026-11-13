# PublicTxt Remotes

Follow other people's PublicTxt repos, see what changed since you last looked, mirror the
pages you want at hand, and fork the ones you want to make your own. Each mirror and fork
records where it came from in its front matter.

> **Status: early development.** Nothing is released. Following sources (hosted or on your
> computer), checking them, mirroring and forking files, converting their links and updating forks from
> upstream work.

## Requirements

- Obsidian desktop 1.14.4 or later. The plugin uses the git CLI, so it doesn't run on mobile.
- [git](https://git-scm.com/) installed. If Obsidian can't find it on your `PATH` (common on
  macOS when Obsidian is started from Finder), set **Git executable** in the plugin settings.

## How it works

- **Sources** are repos you follow, optionally narrowed to some folders. Each is a note in
  `follows/`, named for the source (its **remote name**, such as `follows/ann-notes.md`): the
  repo's `url`, `branch` and `include` in front matter, and why you follow it in the body. Add and edit them in settings or by hand. They are public text, like the rest of
  your vault.
- **Clones.** Each source is kept as a bare partial clone in your vault's hidden `.clones/`
  folder. File contents are fetched only when needed. Obsidian doesn't show it and Sync skips
  it; if your vault is a git repo, add `.clones/` to its `.gitignore`.
- **Checking** shows, per source, what's new since you last looked, your mirrors that are
  behind, and your forks whose original has changed. What's new is a folder tree. Select a source's header to open or close it; one
  with nothing new starts closed. **Mark as seen** starts the next check from here.
- A **mirror** is upstream's copy of a page, in your vault so you can read it in place, search
  it and see its backlinks, without bringing in the whole repo. **Mirror** next to a file in
  the check view (or tick several and **Mirror selected**, or **Mirror a file from a source**)
  copies it into the source's folder under the **community folder**, the source's folders
  kept and its links as upstream wrote them: `wiki/cs/git.md` from `research` into
  `community/research/wiki/cs/git.md`. It carries `mirror_*` keys saying where it came from.
  Don't edit a mirror: when it changes upstream, **Update** (or **Update mirrors**) overwrites
  it, asking first only if you did edit it. **Stop** moves it to the trash.
- A **fork** is your own note, made from a source's page, with `fork_remote` (the source's name),
  `fork_repo`, `fork_path`, `fork_blob` and related keys in its front matter. Those keys are how the plugin tells when the original has
  changed. Fork a Markdown file with **Fork** next to it in the check view, or with **Fork a
  file from a source**. If you mirror the file, its mirror moves into your notes and becomes
  the fork (links to it follow); otherwise the file is fetched. By default it goes to the same
  folder as in the source when your vault has that folder, else to your **fork folder**. You
  can instead pick a folder, with or without the source's folders, and for one file its name. Nothing is overwritten. To fork several, tick files or
  whole folders in the check view and select **Fork selected**. Either way it shows what would
  be written before writing any.
- **Updating a fork.** When a fork's original has changed, **Compare** in the check view opens
  your note with the new upstream version beside it, saying how many lines changed and whether
  you have edited your copy. Then **Overwrite** your note with it (it asks first if you edited
  it), **Write alongside** to save it as a second note, `name (up-01).md`, or **Keep mine**.
  Either way that version isn't listed again; the plugin records it as `fork_seen`. Nothing is
  merged. If the original is gone, **Detach** makes your note an ordinary note, and **Keep**
  leaves it a fork.
- **Converting links.** A fork's links were written for its source: relative to where the file
  was, in its link style. After a fork, if links in your forks of that source can point at
  your copies, a notice offers **Convert**. Converted links point at your copies, in your
  vault's style (wikilinks or Markdown links, both ways). A link to a page you haven't forked
  becomes a link by name: it lands on your note of that name, or waits until you fork it. The
  follow note lists **Links to fix** (images, and the rare link that can't be converted) and
  **Links to check** (where upstream could mean more than one file). Converting doesn't count
  as editing your copy.
- **Mirror and fork lists.** With **List mirrors in follow notes** on, each follow note ends
  with a **Mirrored pages** list of links to the pages mirrored from it; with **List forks in
  follow notes** on, a **Forked pages** list of the pages forked from it. The two are separate
  switches. A follow note's `list_mirrors` or `list_forks` (`true` or `false`) overrides the
  setting for that note. The plugin rewrites those sections only.

## Local sources

A source can be a git repo on your computer, such as another vault. Enter its folder
(`/home/me/notes`) instead of a repo URL, and give it a name.

- **The folder stays private.** The follow note says `local: true` and nothing about where the
  folder is; the path is kept in the plugin's settings for this computer. Publish and sync the
  note freely. On another computer, the source is marked until you set its folder there with
  **Edit**.

- **Only commits show.** A check sees what's committed, not edits in progress. **Snapshot** in
  the check view, or **Snapshot local sources**, commits everything changed in the folder (if
  anything did) and checks again. It commits to the folder's current branch, and refuses if
  that isn't the branch the source follows.
- **Not a repo yet?** Adding the source offers to make the folder one: `git init`, a
  `.gitignore` that leaves out a vault's app folders (its config folder, `.trash/`,
  `.clones/`), and a first snapshot. **Snapshot** makes the same offer for a follow note
  written by hand. A missing folder is refused.
- **Forks name their source.** A fork from a local source records `fork_remote` (the name) and no
  `fork_repo`: there is no public URL to give, and no path is written.

### A local copy of a hosted source

If a repo you follow by URL is also on your computer (your own other vault, cloned from it),
set its folder as the source's **Local copy** when adding or editing it. It stays one source:
the note, and what your mirrors and forks record, is the hosted URL.

- **Fetched from the folder.** The plugin reads the copy instead of the network, so a check
  sees commits you haven't pushed yet. **Snapshot** works on it as on a local source.
- **Must be that repo.** The folder has to be a git repo with a remote for the source's URL.
- **This computer only.** The path is kept in the plugin's settings, never in the note. Where
  the folder isn't there, the source is fetched from its URL as usual.
- **Push before you publish.** A mirror or fork made from an unpushed commit records that
  commit; a site's link to the original is broken until the copy is pushed.

## Commands

| Command | Does |
| --- | --- |
| **Check sources** (also the ribbon) | Opens the check view and checks every source |
| **Open check view** | Opens it without checking |
| **Mirror a file from a source** | Pick a source, then a Markdown file to mirror into the community folder |
| **Stop mirroring this note** | For the note you are in, if it is a mirror: moves it to the trash, after asking |
| **Fork this mirror** | For the note you are in, if it is a mirror: moves it into your notes, as your fork |
| **Fork a file from a source** | Pick a source, then a Markdown file to fork |
| **Compare this fork with upstream** | For the note you are in, if it is a fork: fetches its source and opens the compare |
| **Convert links in this fork** | Points the note's links at your copies, in your vault's link style |
| **Convert links in every fork** | The same for every fork of every source |
| **Snapshot local sources** | Commits what changed in each local source's folder, and in each local copy |
| **Update mirror and fork lists in follow notes** | Rewrites every follow note's **Mirrored pages** and **Forked pages** lists now |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| **Community folder** | `community` | Mirrors go here, each source in a folder named for it (`community/ann-notes/`) unless the source sets its own, with the source's folders kept. If you publish with publictxt-pages, name the same folder in its settings |
| **Fork folder** | vault root | Where your forks go when they don't go to the folder they are in in the source. You can change it at each fork |
| **Match source folders** | on | Offer the same folder as in the source first when your vault has it. You can change it at each fork |
| **List mirrors in follow notes** | off | Keep a **Mirrored pages** list of links at the end of each follow note |
| **List forks in follow notes** | off | Keep a **Forked pages** list of links at the end of each follow note |
| **Clones folder** | `.clones` | Where the git clones live |
| **Git executable** | `git` | Path to git |

## Privacy

**Network.** The plugin uses the network only through git, to fetch the repos you follow from
their hosts (GitHub, GitLab, your own server). It is needed to see what changed in them and to
fork their pages. No other services and no telemetry; git uses your own credentials (SSH keys,
credential helpers).

**Files outside your vault.** Only for local sources and local copies, which live outside the
vault by nature. The plugin reads such a folder's repo to check it. It writes there only when you choose
**Snapshot** or **Make repo**: git commits in that folder, as you, and a `.gitignore` when
making a repo. Clones of all sources stay inside your vault, in `.clones/`.

## Development

Requires Node.js 22.18 or later. Tests run TypeScript directly under `node --test`.

```bash
npm install
npm run dev     # build in watch mode
npm run build   # typecheck + production build
npm test        # unit tests, plus git tests against temporary repos
npm run lint
```

To try it, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/publictxt-remotes/`, then enable **PublicTxt Remotes** in
**Settings → Community plugins**.

Design docs:

- [docs/intent.md](docs/intent.md): why the plugin exists and the decisions behind it
- [docs/spec.md](docs/spec.md): what it does
- [docs/naming.md](docs/naming.md): names used in code, docs and UI

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
