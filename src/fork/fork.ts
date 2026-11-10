// Forking a source file into the vault (docs/spec.md → Fork). Pure.

import type { Fork } from '../check/check.ts';
import type { Head } from '../remote/host.ts';
import type { ForkMeta } from '../sources/fork-meta.ts';
import { repoPath } from '../util/validate.ts';

/** Only Markdown has front matter to record where a fork came from. */
export function isForkable(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

/** The vault path a fork goes to by default: `<folder>/<file name>`; `''` is the vault root. */
export function forkPath(folder: string, path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return folder ? `${folder}/${name}` : name;
}

/** Which rule chose a fork's folder. */
export type FolderReason = 'source' | 'matched' | 'default';

export interface ForkFolderOptions {
	/** The source's `folder`; `null`: none set. */
	sourceFolder: string | null;
	/** `forkFolder`; `''` is the vault root. */
	defaultFolder: string;
	/** Use the remote file's folder when the vault has that exact folder. */
	matchFolders: boolean;
	folderExists: (folder: string) => boolean;
}

/**
 * The vault folder a fork of `path` goes to: the source's folder, else the remote file's folder
 * if the vault has it (and matching is on), else the default. Never a folder to be created for the match.
 */
export function forkFolder(path: string, o: ForkFolderOptions): { folder: string; reason: FolderReason } {
	if (o.sourceFolder) return { folder: o.sourceFolder, reason: 'source' };
	const slash = path.lastIndexOf('/');
	const remote = slash > 0 ? path.slice(0, slash) : '';
	if (o.matchFolders && remote && o.folderExists(remote)) return { folder: remote, reason: 'matched' };
	return { folder: o.defaultFolder, reason: 'default' };
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

export type CheckedPath = { ok: true; path: string } | { ok: false; error: string };

/** A vault path typed by the user: trimmed, `.md` added, never one that exists. */
export function checkForkPath(input: string, taken: (p: string) => boolean): CheckedPath {
	const p = repoPath(input)?.replace(/\/+$/, '');
	if (!p) return { ok: false, error: 'Enter a vault path, like notes/name.md.' };
	const path = isForkable(p) ? p : `${p}.md`;
	if (taken(path)) return { ok: false, error: `${path} already exists.` };
	return { ok: true, path };
}

/** Notes already forked from `path` in `repo`. */
export function forksOf(forks: readonly Fork[], repo: string, path: string): Fork[] {
	return forks.filter((f) => f.meta.repo === repo && f.meta.path === path);
}

/** Provenance for `path` forked from `head` at `now`. */
export function newForkMeta(repo: string, path: string, head: Head, blob: string, now: Date): ForkMeta {
	return { repo, path, blob, branch: head.branch, commit: head.commit, date: localIso(now) };
}

/** ISO 8601 in local time with its offset, to the second: `2026-11-10T13:42:05+02:00`. */
export function localIso(d: Date, offsetMinutes = -d.getTimezoneOffset()): string {
	const local = new Date(d.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
	const sign = offsetMinutes < 0 ? '-' : '+';
	const abs = Math.abs(offsetMinutes);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
