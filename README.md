# PublicTxt Remotes

Follow other people's knowledge bases via their git repos, see what changed since you last looked, mirror the
pages you want at hand, and fork the ones you want to make your own. Each mirror and fork
records where it came from in its front matter.

## Requirements

- Obsidian desktop 1.14.4 or later (the plugin uses the git CLI, so no mobile).
- [git](https://git-scm.com/) installed. If Obsidian can't find it on your `PATH` (common on
  macOS when started from Finder), set **Git executable** in the plugin settings.

## What it does

- **Follow** a repo: a note in `follows/` with its `url`, `branch` and optional `include`
  folders. [Sources](docs/features/sources.md)
- **Check** what's new, which mirrors are behind, and which forks changed upstream.
  [Check](docs/features/check.md)
- **Filter**: narrow a source's news and pages by a combination of tags, before mirroring any, or by what you've mirrored or forked.
  **Follow** tags: what's new lists the pages with them, the rest folded. [Tags](docs/features/tags.md)
- **Mirror** a page: upstream's copy under the **community folder**, to read, search and link
  to. Updates overwrite it. [Mirror](docs/features/mirror.md)
- **Fork** a page: your own note with `fork_*` provenance. [Fork](docs/features/fork.md)
- **Compare** a fork with its new upstream version, then overwrite, write alongside or keep
  yours. Nothing is merged. [Fork update](docs/features/fork-update.md)
- **Links** in a fork are written as your vault writes links, and broken ones can be matched to
  your notes. [Links](docs/features/links.md)
- **Local sources**: follow a git repo on your computer, such as another vault, and snapshot it;
  or give a hosted source a local copy to check from. [Local](docs/features/local.md)
- Optional **Mirrored pages** / **Forked pages** lists in follow notes.
  [Lists](docs/features/lists.md)

Commands are in the command palette; settings are in **Settings → Community plugins**. Clones
live in the hidden `.clones/` folder, which git ignores.

## Install from git

Source install; needs git and Node.js 22.18+.

```bash
cd <vault>/.obsidian/plugins
git clone https://github.com/publictxt/obsidian-publictxt-remotes.git publictxt-remotes
cd publictxt-remotes
npm install
npm run build
```

Then in Obsidian: **Settings → Community plugins**, turn off **Restricted mode**, reload plugins,
and enable **PublicTxt Remotes**.

To update later: `git pull`, `npm install`, `npm run build`, then reload Obsidian.

The build writes `main.js` beside `manifest.json` and `styles.css`; that's all Obsidian loads.
Add `.obsidian/plugins/publictxt-remotes/` to the vault's `.gitignore` if you do not want the clone inside it.

## Use it

1. In **Settings → PublicTxt Remotes**, select **Add source**. Enter a repo URL, the local path
   of a git repo on your computer, or both if you have a clone of that repo.
2. Run **Check sources** from the command palette (or the ribbon). The check view opens in the
   right sidebar.
3. Select **Mirror** or **Fork** next to a file, or tick several and use **Mirror selected** /
   **Fork selected**.
4. Check again later. When a mirror or fork changed upstream, select **Update** or **Compare**.
5. Select **Mark as seen** to start the next check from here.

## Privacy

The network is used only through git, to fetch the repos you follow, with your own credentials.
Filtering a source by tag downloads its pages into its clone; following tags downloads the
changed pages at each check. No other services, no telemetry.

The plugin writes outside your vault only for local sources and local copies, and only when you
choose **Snapshot** or **Make repo**: git commits in that folder, as you, and a `.gitignore`
when making a repo. A local folder's path is kept in the plugin's settings, never in a note.

## Development

```bash
npm install
npm run dev     # watch
npm run build   # typecheck + production build
npm test        # unit tests, plus git tests against temporary repos
npm run lint
```

Design docs: [docs/](docs/README.md).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
