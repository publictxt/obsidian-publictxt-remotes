# PublicTxt Remotes

Follow other people's knowledge bases via their git repos, see what changed since you last looked, mirror the
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

Reference for each feature: [docs/features/](docs/features/).

- **Sources** are repos you follow, optionally narrowed to some folders. Each is a note in
  `follows/` named for the source (its **remote name**, such as `follows/ann-notes.md`), with
  `url`, `branch` and `include` in front matter and your reasons in the body. Add and edit them
  in settings or by hand. They are public text, like the rest of your vault.
- **Clones.** Each source is a bare partial clone in the hidden `.clones/` folder, with file
  contents fetched on demand. Sync skips it; if your vault is a git repo, add `.clones/` to its
  `.gitignore`.
- **Checking** shows, per source, what's new since you last looked, mirrors that are behind, and
  forks whose original changed. **Mark as seen** starts the next check from here.
- **Mirror** a page to keep upstream's copy in your vault, to read, search and see backlinks,
  without bringing in the whole repo. It goes under the **community folder** with the source's
  folders kept (`wiki/cs/git.md` from `research` → `community/research/wiki/cs/git.md`), carries
  `mirror_*` keys, and has its links pointed into that folder. Don't edit it: **Update** overwrites
  it (asking first only if you edited it). **Stop** trashes it.
- **Fork** a page to make it your own: your note, with `fork_*` keys saying where it came from.
  A mirrored file's mirror moves into your notes; otherwise the file is fetched. It goes to the
  same folder as in the source if your vault has it, else your **fork folder**, or a folder you
  pick. Nothing is overwritten, and you see what would be written first. Tick files or folders
  and **Fork selected** to fork several.
- **Updating a fork.** **Compare** opens your note beside the new upstream version, with lines
  changed and whether you edited your copy. Then **Overwrite**, **Write alongside** as
  `name (up-01).md`, or **Keep mine**. Nothing is merged. If the original is gone, **Detach** or
  **Keep**.
- **Converting links.** Links in a copy were written for its source. After a fork, a notice
  offers **Convert** to point links at your copies in your vault's link style; links to pages you
  don't have go by name. A mirror's links are rewritten into its folder automatically, so a link
  to an unmirrored page dangles rather than landing on your own same-named note. The follow note
  lists **Links to fix** and **Links to check**. Converting isn't an edit.
- **Mirror and fork lists.** Optionally, follow notes end with **Mirrored pages** and **Forked
  pages** lists. Switches are in settings, and `list_mirrors` / `list_forks` override per note.

## Local sources

A source can be a git repo on your computer, such as another vault: enter its folder instead of
a URL, and a name.

- **The folder stays private**: the note says `local: true`; the path lives in this computer's
  settings. On another computer, **Edit** the source to set its folder.
- **Only commits show.** **Snapshot** in the check view commits everything changed (if any) to
  the folder's current branch, refusing if that isn't the source's branch.
- **Not a repo yet?** Adding offers `git init` with a `.gitignore` (vault app folders left out)
  and a first snapshot.
- Forks record `fork_remote` and no `fork_repo`.

### A local copy of a hosted source

If a repo you follow by URL is also on your computer, set its folder as the source's **Local
copy**. It stays one source, keyed by the URL.

- In the check view, **Local** / **Remote** pick where to check from; the choice is remembered.
  Switching can list every file as new if the two differ; **Mark as seen** starts from there.
  **Snapshot** works while **Local** is selected.
- The folder must be a git repo with a remote for the source's URL.
- A missing folder is an error from **Local**; select **Remote** to use the network.
- Push before you publish: a mirror or fork from an unpushed commit links to a commit the host
  doesn't have yet.

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
| **Convert links in this note** | For the note you are in: a fork's links point at your copies, in your vault's link style; a mirror's point by full path into its mirror folder |
| **Convert links in every fork and mirror** | The same for every copy of every source |
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

Design docs are in [docs/](docs/README.md): why the plugin exists, names, and one reference
file per feature.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
