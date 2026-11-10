# PublicTxt for Obsidian

Follow other people's PublicTxt repos, see what changed since you last looked, and fork the
pages you want into your vault. Each fork records where it came from in its front matter.

> **Status: early development.** Nothing is released. Following sources, checking them and
> forking files work; updating a fork is next.

## Requirements

- Obsidian desktop. The plugin uses the git CLI, so it doesn't run on mobile.
- [git](https://git-scm.com/) installed. If Obsidian can't find it on your `PATH` (common on
  macOS when Obsidian is started from Finder), set **Git executable** in the plugin settings.

## How it works

- **Sources** are repos you follow, optionally narrowed to some folders. Each is a note
  in `follows/`: the repo's `url`, `branch` and `include` in front matter, and why you
  follow it in the body. Add and edit them in settings or by hand. They are public text, like the
  rest of your vault.
- A source can also be a git repo on your computer: enter its path (`/home/me/notes`) or a
  `file:///` URL as the repo URL. The plugin sees what's committed, not uncommitted edits:
  **Snapshot** in the check view, or the **Snapshot local sources** command, commits everything
  changed in the folder (only if something did) and checks again. It commits to the folder's
  current branch, with your git identity. A local path means nothing on another computer, so
  forks from it record a provenance only you can follow.
- Each source is kept as a bare partial clone in your vault's hidden `.remotes/` folder. File
  contents are fetched only when needed. Obsidian doesn't show it and Sync skips it; if your
  vault is a git repo, add `.remotes/` to its `.gitignore`.
- A **fork** is a note copied from a source, with `fork_repo`, `fork_path`, `fork_blob` and
  related keys in its front matter. Those keys are how the plugin tells when the original
  has changed. Fork a Markdown file with **Fork** next to it in the check view, or with the
  **Fork a file from a source** command. You choose where it goes; nothing is overwritten.
  With **List forks in follow notes** on, each follow note ends with a **Forked pages** list of
  links to the pages forked from it. A follow note's `list_forks: true` or `false` overrides the
  setting for that note. The plugin rewrites that section only.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| **Fork folder** | vault root | Where forked notes go, unless the source sets its own |
| **Match source folders** | on | Fork into the same folder as in the source when your vault has it |
| **List forks in follow notes** | off | Keep a **Forked pages** list of links at the end of each follow note |
| **Remotes folder** | `.remotes` | Where the git clones live |
| **Git executable** | `git` | Path to git |

## Privacy

The plugin talks to the network only through git, and only for the repos you follow. It sends
no telemetry and uses your own git credentials (SSH keys, credential helpers).

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
`<vault>/.obsidian/plugins/publictxt/`, then enable **PublicTxt** in
**Settings → Community plugins**.

Design docs:

- [docs/intent.md](docs/intent.md): why the plugin exists and the decisions behind it
- [docs/spec.md](docs/spec.md): what it does
- [docs/naming.md](docs/naming.md): names used in code, docs and UI

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
