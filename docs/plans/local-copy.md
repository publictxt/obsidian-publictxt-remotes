# One source, hosted and local: design record

Built on `feat/local-copy` (2026-11-13). The spec is `docs/spec.md` → Local copies.

## The case

A repo can be reached two ways: its hosted origin (`https://github.com/ann/notes`) and a
working copy on this computer (another vault, cloned from it). As two sources (a hosted follow
note with `url`, and a local one with `local: true`), mirrors and forks split between two remote
names, the site shows two sources with two ratings, and nothing says they are one repo.

## Options

1. **Two follow notes, linked.** Keep both; one names the other (`same_as: ann-notes`), and
   readers merge them. Every reader (the plugin, publictxt-pages, Facets) has to learn the
   merge, ratings can disagree, and a fork's `fork_remote` still names one or the other.
2. **One follow note, with a local copy (chosen).** The note is the hosted source: its `url` is
   its identity, published as before. This computer may also have a folder for it in
   `localPaths`, and the plugin fetches from that folder instead of the network. Nothing in the
   note changes, so readers need nothing new.

## What was built

- **Identity is the URL.** Key, clone, `fork_repo` and `mirror_repo` stay the hosted URL;
  `fork_remote` the one name. The site shows one source with one rating.
- **The folder is this computer's.** `localPaths[name]` applies to a hosted source too, as
  "fetch from here". `local: true` stays for a repo with no public URL.
- **Fetching.** `vaultHost()` sets the clone's origin before each fetch (`remote set-url`), now
  for every source: a hosted one with a folder fetches from `fileUrl(folder)`, else from its
  URL (`fetchFrom()`). The clone stays the same; only where it fetches from changes.
- **Settings.** The source form has an optional **Local copy** field for a hosted source; the
  settings row says `local copy: /path`. Clearing it goes back to the network.
- **Snapshot.** Offered for a hosted source with a local copy too.

## The open points, as decided

- **Not the same repo: refused.** The folder must be a repo with a remote whose canonical URL
  is the source's `url`. A folder that isn't a repo is refused too, never made one.
- **Fall back: to the network.** A missing folder (another computer, an unplugged drive) means
  the URL is fetched, with no error: `data.json` can travel with the vault, and a hosted source
  should still check there. A local source still reports its missing folder, having no URL.
- **Ahead of origin: accepted, for now.** A fork or mirror made from an unpushed commit records
  a `fork_commit` / `mirror_commit` the host doesn't have, so the site's "↗ original" link 404s
  until pushed. Documented in the README. Still possible: warn when the copy is ahead of the
  remote it was matched by, or record the branch link instead of the commit.
- **Moving between the two: by hand.** To turn a `local: true` source into a hosted one with a
  local copy, edit the note (`url` in, `local` out) and set **Local copy**. The remote name
  stays, so mirrors and forks still match; their `fork_repo` / `mirror_repo` stay absent until
  rewritten. The clone and seen state are keyed by the old `local:` key, so the first check
  lists every file. No command for it yet.
