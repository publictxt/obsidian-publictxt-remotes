# Docs

Read only what the task needs.

| File | Holds |
|---|---|
| [intent.md](intent.md) | Why the plugin exists, the decisions that shape it, what's open |
| [naming.md](naming.md) | Vocabulary, frozen ids, where the code lives |
| [features/](features/) | What each feature does: the reference. One file per feature |
| `plans/` | What's planned and not built: none now. A plan goes once built |

Features:

| File | Covers |
|---|---|
| [sources.md](features/sources.md) | `data.json`, follow notes, canonical URL, settings tab, state |
| [check.md](features/check.md) | A check, and the check view |
| [tags.md](features/tags.md) | Tags of a source's pages: the filter, the tag index, followed tags |
| [git.md](features/git.md) | `RemoteHost` over the git CLI: clones, commands, errors |
| [local.md](features/local.md) | Local sources, local copies, making a repo, snapshot |
| [mirror.md](features/mirror.md) | Mirror provenance; mirror, update, stop |
| [fork.md](features/fork.md) | Fork provenance; the fork modal |
| [fork-update.md](features/fork-update.md) | Compare, overwrite, write alongside, keep, detach |
| [lists.md](features/lists.md) | Mirror and fork lists in follow notes |
| [links.md](features/links.md) | A note's links: converting their form, matching broken ones, both |

Each feature file ends with its code. Nothing is released yet: everything, ids included, can
still change until the first release.
