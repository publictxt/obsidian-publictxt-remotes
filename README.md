# PublicTxt Remotes

Follow other people's knowledge bases via their git repos, see what changed since you last looked, mirror the
pages you want at hand, and fork the ones you want to make your own. Each mirror and fork
records where it came from in its front matter.

> **Status: early development.** Nothing is released.

## Requirements

- Obsidian desktop 1.14.4 or later (the plugin uses the git CLI, so no mobile).
- [git](https://git-scm.com/) installed. If Obsidian can't find it on your `PATH` (common on
  macOS when started from Finder), set **Git executable** in the plugin settings.

## What it does

- **Follow** a repo: a note in `follows/` with its `url`, `branch` and optional `include`
  folders. [Sources](docs/features/sources.md)
- **Check** what's new, which mirrors are behind, and which forks changed upstream.
  [Check](docs/features/check.md)
- **Mirror** a page: upstream's copy under the **community folder**, to read, search and link
  to. Updates overwrite it. [Mirror](docs/features/mirror.md)
- **Fork** a page: your own note with `fork_*` provenance. [Fork](docs/features/fork.md)
- **Compare** a fork with its new upstream version, then overwrite, write alongside or keep
  yours. Nothing is merged. [Fork update](docs/features/fork-update.md)
- **Convert links** so a copy's links point at your copies in your vault's style.
  [Convert links](docs/features/convert-links.md)
- **Local sources**: follow a git repo on your computer, such as another vault, and snapshot it;
  or give a hosted source a local copy to check from. [Local](docs/features/local.md)
- Optional **Mirrored pages** / **Forked pages** lists in follow notes.
  [Lists](docs/features/lists.md)

Commands are in the command palette; settings are in **Settings → Community plugins**
([fields](docs/features/sources.md)). Clones live in the hidden `.clones/` folder: if
your vault is a git repo, add it to `.gitignore`.

## Privacy

The network is used only through git, to fetch the repos you follow, with your own credentials.
No other services, no telemetry.

The plugin writes outside your vault only for local sources and local copies, and only when you
choose **Snapshot** or **Make repo**: git commits in that folder, as you, and a `.gitignore`
when making a repo. A local folder's path is kept in the plugin's settings, never in a note.

## Development

Node.js 22.18 or later.

```bash
npm install
npm run dev     # watch
npm run build   # typecheck + production build
npm test        # unit tests, plus git tests against temporary repos
npm run lint
```

To try it, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/publictxt-remotes/` and enable **PublicTxt Remotes**. Design docs:
[docs/](docs/README.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
