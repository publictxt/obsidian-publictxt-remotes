// Forking a source file into the vault (docs/spec.md → Fork). Pure.

import type { Fork } from '../check/check.ts';
import type { Head } from '../remote/host.ts';
import type { ForkMeta } from '../sources/fork-meta.ts';
import { isLocalRepo } from '../sources/repo-url.ts';

/** Only Markdown has front matter to record where a fork came from. */
export function isForkable(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

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

/** A followed remote: its key (`Source.url`) and its name. */
export interface Remote {
	url: string;
	name: string;
}

/**
 * Whether `meta` is a fork from `remote`: by `fork_remote` when the fork has one (names compared
 * without case, as file names are), else by `fork_repo`.
 */
export function isForkOf(meta: ForkMeta, remote: Remote): boolean {
	if (meta.remote !== null) return meta.remote.toLowerCase() === remote.name.toLowerCase();
	return meta.repo === remote.url;
}

/** Notes already forked from `path` in `remote`. */
export function forksOf(forks: readonly Fork[], remote: Remote, path: string): Fork[] {
	return forks.filter((f) => isForkOf(f.meta, remote) && f.meta.path === path);
}

/** Provenance for `path` forked from `remote` at `head`, at `now`. A local source has no `fork_repo`. */
export function newForkMeta(remote: Remote, path: string, head: Pick<Head, 'branch' | 'commit'>, blob: string, now: Date): ForkMeta {
	const repo = isLocalRepo(remote.url) ? null : remote.url;
	return { remote: remote.name, repo, path, blob, branch: head.branch, commit: head.commit, date: localIso(now), seen: null };
}

/** ISO 8601 in local time with its offset, to the second: `2026-11-10T13:42:05+02:00`. */
export function localIso(d: Date, offsetMinutes = -d.getTimezoneOffset()): string {
	const local = new Date(d.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
	const sign = offsetMinutes < 0 ? '-' : '+';
	const abs = Math.abs(offsetMinutes);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
