# Mirror

A mirror is upstream's copy of a page in the vault: searchable, with backlinks and graph, opened
in place. Not for editing: updates overwrite it. Follow → mirror → fork keeps reading someone's
pages apart from owning a copy.

## Provenance

`mirror_remote`, `mirror_repo`, `mirror_path`, `mirror_branch`, `mirror_commit`, `mirror_blob`,
`mirror_date`: as their `fork_*` namesakes ([fork.md](fork.md)), for the version held. No
`mirror_seen`: an update overwrites.

A note is a mirror when `mirror_path` and `mirror_blob` are valid, it has a valid
`mirror_remote` or `mirror_repo`, and it isn't a fork (valid `fork_*` keys win). Writing a
mirror removes every `fork_*` key. Keys decide, not the folder: a mirror moved by hand is still
one. Mirrors are found by scanning.

## Where

`<communityFolder>/<folder or remote name>/<upstream path>` (`mirrorFolderOf()`,
`mirrorPath()`): `wiki/cs/git.md` from `txt` → `community/txt/wiki/cs/git.md`. Never asked.

## Mirror

From the check view (**Mirror** on a file, or **Mirror selected**, which clears ticks) at the
head the check saw, or **Mirror a file from a source** (pick source, skipped if one; fetch head;
pick file). Markdown only. Per file (`planMirrors()`):

- Already mirrored anywhere: left alone.
- Its place taken by something else: skipped, reported.
- Otherwise: blob fetched, note created, `mirror_*` keys added. Upstream front matter that isn't
  valid YAML is refused before writing.

One notice (sticky on failure); the note isn't opened. Then its links are converted
([convert-links.md](convert-links.md)).

## Update

**Update** on a file, or **Update mirrors (n)**, overwrites with upstream at the head the check
saw and rewrites `mirror_*`. No compare. An edited mirror (text differs from its version,
keys and link format aside; or that version can't be read) isn't overwritten unasked: **Update**
asks and suggests forking; **Update mirrors** skips and names it. Links are converted again
after.

## Stop

**Stop** on a mirrored file, **Remove** on one gone upstream, or **Stop mirroring this note**:
after confirming, the mirror is trashed. Nothing of the user's is lost. A gone mirror stays
listed until removed or forked.

## Code

Pure: `src/mirror/mirror.ts`, `src/sources/fork-meta.ts`. Vault: `src/mirror/run.ts`,
`src/sources/forks.ts`.
