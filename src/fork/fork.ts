// Forking a source file into the vault (docs/features/fork.md). Pure.

import type { Remote } from '../copy/copy.ts';
import type { Head } from '../remote/host.ts';
import type { ForkMeta } from '../sources/fork-meta.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import { localIso } from '../util/time.ts';

/** The vault path a fork goes to by default: `<folder>/<file name>`; `''` is the vault root. */
export function forkPath(folder: string, path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return folder ? `${folder}/${name}` : name;
}

/** `path` if free, else the first free `<name> 1.md`, `<name> 2.md`, … */
export function freePath(path: string, taken: (p: string) => boolean): string {
	if (!taken(path)) return path;
	const dot = path.lastIndexOf('.');
	const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
	for (let n = 1; ; n++) {
		const p = `${stem} ${n}${ext}`;
		if (!taken(p)) return p;
	}
}

/** Provenance for `path` forked from `remote` at `head`, at `now`. A local source has no `fork_repo`. */
export function newForkMeta(remote: Remote, path: string, head: Pick<Head, 'branch' | 'commit'>, blob: string, now: Date): ForkMeta {
	const repo = isLocalRepo(remote.url) ? null : remote.url;
	return { remote: remote.name, repo, path, blob, branch: head.branch, commit: head.commit, date: localIso(now), seen: null };
}
