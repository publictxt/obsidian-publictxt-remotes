# PublicTxt Remotes

Follow other people's PublicTxt repos, see what changed since you last looked, and fork the
pages you want into your vault. Each fork records where it came from in its front matter.

> **Status: early development.** Nothing is released. Following sources (hosted or on your
> computer), checking them and forking files work; updating a fork is next.

## Requirements

- Obsidian desktop. The plugin uses the git CLI, so it doesn't run on mobile.
- [git](https://git-scm.com/) installed. If Obsidian can't find it on your `PATH` (common on
  macOS when Obsidian is started from Finder), set **Git executable** in the plugin settings.

## How it works

- **Sources** are repos you follow, optionally narrowed to some folders. Each is a note in
  `follows/`, named for the source (its **remote name**, such as `follows/ann-notes.md`): the
  repo's `url`, `branch` and `include` in front matter, and why you follow it in the body. Add and edit them in settings or by hand. They are public text, like the rest of
  your vault.
- **Clones.** Each source is kept as a bare partial clone in your vault's hidden `.remotes/`
  folder. File contents are fetched only when needed. Obsidian doesn't show it and Sync skips
  it; if your vault is a git repo, add `.remotes/` to its `.gitignore`.
- **Checking** shows, per source, what's new since you last looked, the files you watch, and
  your forks whose original has changed. What's new is a folder tree. Select a source's header to open or close it; one
  with nothing new starts closed. **Mark as seen** starts the next check from here.
- A **fork** is a note copied from a source, with `fork_remote` (the source's name),
  `fork_repo`, `fork_path`, `fork_blob` and related keys in its front matter. Those keys are how the plugin tells when the original has
  changed. Fork a Markdown file with **Fork** next to it in the check view, or with **Fork a
  file from a source**. You choose where it goes; nothing is overwritten.
- **Fork lists.** With **List forks in follow notes** on, each follow note ends with a **Forked
  pages** list of links to the pages forked from it. A follow note's `list_forks: true` or
  `false` overrides the setting for that note. The plugin rewrites that section only.

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
  `.remotes/`), and a first snapshot. **Snapshot** makes the same offer for a follow note
  written by hand. A missing folder is refused.
- **Forks name their source.** A fork from a local source records `fork_remote` (the name) and no
  `fork_repo`: there is no public URL to give, and no path is written.

## Commands

| Command | Does |
| --- | --- |
| **Check sources** (also the ribbon) | Opens the check view and checks every source |
| **Open check view** | Opens it without checking |
| **Fork a file from a source** | Pick a source, then a Markdown file to fork |
| **Snapshot local sources** | Commits what changed in each local source's folder |
| **Update fork lists in follow notes** | Rewrites every follow note's **Forked pages** list now |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| **Fork folder** | vault root | Where forked notes go, unless the source sets its own |
| **Match source folders** | on | Fork into the same folder as in the source when your vault has it |
| **List forks in follow notes** | off | Keep a **Forked pages** list of links at the end of each follow note |
| **Remotes folder** | `.remotes` | Where the git clones live |
| **Git executable** | `git` | Path to git |

## Privacy

**Network.** The plugin uses the network only through git, to fetch the repos you follow from
their hosts (GitHub, GitLab, your own server). It is needed to see what changed in them and to
fork their pages. No other services and no telemetry; git uses your own credentials (SSH keys,
credential helpers).

**Files outside your vault.** Only for local sources, which live outside the vault by nature.
The plugin reads a local source's repo to check it. It writes there only when you choose
**Snapshot** or **Make repo**: git commits in that folder, as you, and a `.gitignore` when
making a repo. Clones of all sources stay inside your vault, in `.remotes/`.

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
