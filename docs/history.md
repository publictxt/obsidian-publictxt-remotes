# History

Past names and dropped designs, for reading old commits. Nothing here is current; existing
vaults are not migrated.

| Was | Now | Why |
|---|---|---|
| Repo `obsidian-publictxt` | `obsidian-publictxt-remotes` | 2026-11-10 |
| GitHub REST adapter | git CLI | Any host, user's auth, no rate limits. Parked at tag `archive/github-adapter` |
| Sources in `data.json` | Follow notes in `follows/` | One public source of truth (ADR-0014) |
| `.remotes/`, `remotesFolder` | `.clones/`, `clonesFolder` | Was taken for the remotes root |
| Remotes root `remotes/<source>/`, forks there | Community folder `community/<source>/`, mirrors there; forks back in `forkFolder` | Named for readers; upstream's copies apart from the user's |
| `watch`, Watched list | Mirrors | A mirror is a watched file the vault also holds |
| `follow_*` keys (planned) | `mirror_*` | "Follow" is for repos; publictxt-pages uses `follow_*` on follow pages |
| Source's fork `folder` | Mirror folder | |
| Fork links left as written when not forked | Link by name | The wiki way |
| Fork links read against the source and pointed at copies, when offered; "Links to fix" / "Links to check" reports; **Convert links in every fork** | Converted in form only, paths kept; matching broken links apart | Simpler |
| Mirror links by full path into the mirror folder | Left as written | Simpler: a mirror is upstream's text; the wiki way |
| Separate one-file and many-file fork modals | One `ForkModal` | |

Design briefs for each feature lived in `docs/plans/` until built; see git history.
