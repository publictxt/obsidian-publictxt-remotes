# PublicTxt Remotes — Intent

Why this plugin exists and the decisions behind its shape. What it does is in `spec.md`, names
in `naming.md`.

## Why

PublicTxt's v1 aim is to "pull selected pages from other people's PublicTxt repos into a local
aggregate view" (publictext `README.md`, Roadmap). `obsidian-publictxt-facets` is the browsing
half and stays offline by design. This plugin is the pulling half: it talks to remote repos and
writes into the vault, only when the user asks. Outside the vault it writes only to a local
source's folder, again only when asked.

## First use case

1. Follow a few remote repos.
2. See what changed in them since I last looked.
3. Fork a page I want: copy it into a folder I choose, with where it came from in its front
   matter.
4. Next check, see which of my forks have changed upstream.

## Decisions

- **The fork records its own provenance.** Source repo, path, branch, commit and blob live in
  the forked note's front matter. The list of forks is *derived* by scanning the vault, never
  stored separately: one source of truth, and moving, renaming or deleting a fork needs no
  bookkeeping. Fork provenance is an authored fact (it can't be recomputed), so storing it
  doesn't break publictext ADR-0003 (no derived data on disk).
- **Config and state are separate.** Sources (what I follow) are config. Last-seen commits and
  acknowledged blobs are state: a cache, safe to delete, at worst everything shows as new.
- **Change detection by git blob SHA.** The blob SHA of a file is content-addressed and the same
  on every host. Storing it at fork time also keeps the merge base, which a later
  "update my fork" (three-way merge) or "propose back upstream" needs.
- **Desktop only, using the git CLI** (decided 2026-11-03; for good, 2026-11-10). Git gives any
  host, the user's own auth (SSH keys, credential helpers), no API rate limits, full history,
  and `git merge-file` for updating forks later. It matches publictext ADR-0004 (git CLI on the
  .NET side). PublicTxt users keep their notes in git, so desktop users have it. Local sources,
  snapshots and making repos need a file system and git too, so there is no mobile version to
  plan for. Node imports stay in `src/remote/git-process.ts`, which keeps the rest pure and
  testable under plain Node. A GitHub REST adapter, built before this was decided, is parked at
  tag `archive/github-adapter`.
- **Clones live in the vault's hidden `.remotes/` folder** (setting), one bare partial clone per source
  (`--filter=blob:none`): history and trees up front, file contents fetched on demand. Bare
  clones have no working files, so no remote `.md` shows up as a note.
- **Sources are notes** (decided 2026-11-03; publictext ADR-0014). One note per followed repo in
  `follows/`, its fields in front matter, the user's reasons in the body. Found by
  scanning, like forks. The folder makes a note a source, so moving it out unfollows. The
  plugin's own keys (`watch`, `folder`) sit beside the spec's and are public with the note.
- **Follow whole repos, narrow locally** (publictext ADR-0005). A source fetches the whole repo's
  tree; `include` prefixes and `watch` paths filter it on this side.
- **Local sources are git repos too** (decided 2026-11-10). A folder on this computer is
  followed through the same clone and check path, so nothing downstream changes. A plain folder can't be a source: without commits there is no history for "what's
  new", and no old blob to keep as the merge base for updating a fork. So the plugin makes the
  commits instead, on the user's action: **Snapshot**, and an offer to make a folder a repo.
  These are its only writes outside the vault, always into the source's own folder. Snapshot
  refuses a branch mismatch instead of committing to a branch that isn't checked out, which
  would overwrite that branch with the folder's state.
- **Remotes are named** (decided 2026-11-10). A follow note's file name is the source's name,
  as `git remote` names a URL, and forks record it as `fork_remote`. A hosted fork keeps
  `fork_repo` too: anyone reading a published fork can follow it to the original, which a name
  alone can't give. A local source's folder is never written into a note: a published repo's
  files are public even when a page isn't, and a path means nothing on another computer anyway.
  It lives in `data.json`, per computer. Names are read-only, since forks record them; making
  `fork_remote` a link that Obsidian updates on rename is parked.
- **Updating a fork is a compare, not a merge** (decided 2026-11-11). The new upstream version
  opens in a pane beside the note; the user overwrites the note, writes upstream alongside as
  `name (up-nn).md`, or keeps theirs. The alongside note is itself a fork, so one upstream file
  can have several copies, and the newest is compared next time. `fork_seen` records the
  upstream version dealt with, so `fork_blob` stays what the note's text came from: the merge
  base, should merging come later.
- **Forks' links point at the vault's copies, in the vault's style** (decided 2026-11-12). A
  link means what it means upstream: it is read against the source's files at the fork's
  commit, and pointed at the vault's copy of that file, never at a note that merely shares its
  name. Obsidian writes the new link, so converting to wikilinks or to Markdown links is one
  code path. A link to a note not in the vault becomes a link by name: it lands on the user's
  note of that name, or dangles until it is forked. That is the wiki way, not a hazard, so
  there are no guards against it. Converting is offered after a fork, never automatic, and a
  converted link is not an edit, so **Overwrite** doesn't ask because of it. What converting
  left, and the calls it made, are listed in the follow note, which is public like the forks.
  Offering to fork the notes those links name may come later. Details:
  `docs/plans/convert-links.md`.
- **Folder selection reuses the manifest's convention**: repo-relative folder prefixes ending in
  `/` (as `types` and `ignore` in `publictxt.yaml`), not a new glob grammar. Tag filters need
  file contents, so they wait.

## Open questions

1. **Where sources live.** Decided 2026-11-03: one note per repo in `follows/`
   (publictext ADR-0014), read and written by the plugin. Public text, readable, one source of
   truth, the same shape as forks. State stays in `data.json`.
2. **Front matter prefix.** `fork_*` (see `spec.md`). `upstream_*` is the git word, `source_*`
   collides with the spec's open `source_repo` (§5), which means "repo this doc lives in".
3. **Canonical repo URL** (publictext spec §13 q2). We need one now, as the key for sources and
   forks. v0 rule in `spec.md`; propose it upstream. Local sources have no URL in their notes,
   so nothing local goes into the proposal.
4. **`.remotes/` and sync.** Decided 2026-11-03: the clones default to the hidden `.remotes/`,
   which Obsidian neither shows nor indexes and Sync skips. A vault git repo still needs
   `.remotes/` in its `.gitignore`: git doesn't skip dot folders. Public follow notes live
   apart, in `follows/`, so the ignore rule stays one line.
5. **Local edits to a fork.** Detecting them needs a hash of the body without the `fork_*` keys.
   Deferred until "update my fork" is built. Answered 2026-11-11 without a stored hash: the
   compare fetches the version at `fork_blob` and compares it with the note, body and parsed
   front matter, `fork_*` keys aside. It costs a fetch, so only the compare does it, not the
   check.
6. **Removing a source leaves its clone** (`<remotesFolder>/<host>/<owner>/<repo>.git`, or
   `<remotesFolder>/local/<name>-<hash>.git` for a local source). Options: delete it on remove
   (asking first), offer a "clean up clones" command, or leave it. Left for now: re-adding is
   then cheap.
7. **Create the remote's folders on fork.** Folder matching uses the remote file's folder only
   when the vault already has it. An option to create it instead would mirror the remote's
   layout. Parked 2026-11-10. Answered per fork 2026-11-11: the fork modal's **Same folder as in
   the source** creates the folder when the user turns it on. A setting to always do so stays
   parked.
8. **`fork_remote` as a link.** `[[follows/name]]` would be clickable and follow renames, if
   Obsidian updates links in properties; then names needn't be read-only. Parked 2026-11-10:
   the spec uses Markdown links, and it needs checking.
9. **A local source's state on another computer.** `localPaths` is per computer, but Sync may
   carry `data.json` (plugin settings) between them. A folder set on one then shows on another,
   where it's likely missing: a check reports it. Not handled yet.

## Proposed changes to the publictext spec

Not authoritative there yet; raise when this settles.

- Reserve `fork_remote`, `fork_repo`, `fork_path`, `fork_branch`, `fork_commit`, `fork_blob`, `fork_date`
  (§5), as authored provenance.
- Reserve `fork_seen` too: the upstream blob a reader has looked at without taking, or `gone`.
- `follows` entries gain `branch` (default: the remote's default branch) and `include` (folder
  prefixes): the first, simplest piece of the open filter grammar (§13 q1).
- A v0 canonical repo URL (§13 q2).
