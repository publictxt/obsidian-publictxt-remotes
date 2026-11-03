# PublicTxt for Obsidian

Follow other people's PublicTxt repos, see what changed since you last looked, and fork the
pages you want into your vault. Each fork records where it came from in its front matter.

> **Status: early development.** Nothing is released. The data model and the git layer are
> built and tested. The settings tab, check view and fork command are in progress.

## Requirements

- Obsidian desktop. The plugin uses the git CLI, so it doesn't run on mobile.
- [git](https://git-scm.com/) installed. If Obsidian can't find it on your `PATH` (common on
  macOS when Obsidian is started from Finder), set **Git executable** in the plugin settings.

## How it works

- **Sources** are remote repos you follow, optionally narrowed to some folders. Each is a note
  in `follows/`: the repo's `url`, `branch` and `include` in front matter, and why you
  follow it in the body. Add and edit them in settings or by hand. They are public text, like the
  rest of your vault.
- Each source is kept as a bare partial clone in your vault's hidden `.remotes/` folder. File
  contents are fetched only when needed. Obsidian doesn't show it and Sync skips it; if your
  vault is a git repo, add `.remotes/` to its `.gitignore`.
- A **fork** is a note copied from a source, with `fork_repo`, `fork_path`, `fork_blob` and
  related keys in its front matter. Those keys are how the plugin tells when the original
  has changed.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| **Fork folder** | vault root | Where forked notes go |
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
