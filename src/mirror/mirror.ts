// Mirroring a source file into the vault (docs/spec.md → Mirror): upstream's copy, in the
// source's folder under the community folder, at the path it has upstream. Pure.

import type { Head } from '../remote/host.ts';
import type { ForkMeta, MirrorMeta } from '../sources/fork-meta.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import { localIso } from '../util/time.ts';
import type { Remote } from '../fork/fork.ts';

/** A source's folder of mirrors: its `folder`, else its name, under the community folder. */
export function mirrorFolderOf(communityFolder: string, folder: string | null, name: string): string {
	return [communityFolder, folder || name].filter((f) => f !== '').join('/');
}

/** The vault path of the mirror of the upstream file `path`: the same path, in the source's folder. */
export function mirrorPath(folder: string, path: string): string {
	return [folder, path].filter((f) => f !== '').join('/');
}

/** Provenance for `path` mirrored from `remote` at `head`, at `now`. A local source has no `mirror_repo`. */
export function newMirrorMeta(remote: Remote, path: string, head: Pick<Head, 'branch' | 'commit'>, blob: string, now: Date): MirrorMeta {
	const repo = isLocalRepo(remote.url) ? null : remote.url;
	return { remote: remote.name, repo, path, blob, branch: head.branch, commit: head.commit, date: localIso(now) };
}

/** A mirror's provenance after its text is replaced by `blob` at `head`. */
export function updatedMirrorMeta(old: MirrorMeta, head: Pick<Head, 'branch' | 'commit'>, blob: string, now: Date): MirrorMeta {
	return { remote: old.remote, repo: old.repo, path: old.path, branch: head.branch, commit: head.commit, blob, date: localIso(now) };
}

/**
 * A mirror's provenance as the fork it becomes at `now`: the same file, branch, commit and blob
 * (its text came from that blob), forked now.
 */
export function forkedMeta(m: MirrorMeta, now: Date): ForkMeta {
	return { remote: m.remote, repo: m.repo, path: m.path, branch: m.branch, commit: m.commit, blob: m.blob, date: localIso(now), seen: null };
}

/**
 * What mirroring one file comes to: `new`, written to `to`; `mirrored`, already at `to`; or
 * `taken`, where `to` holds something that isn't its mirror.
 */
export interface PlannedMirror {
	path: string;
	to: string;
	state: 'new' | 'mirrored' | 'taken';
}

/**
 * Where each of `paths` is mirrored under `folder`. `mirrored`: upstream path → the note that
 * already mirrors it, wherever it is. A path is `taken` when the vault has something there, or an
 * earlier one of `paths` goes there (compared without case, as file names are).
 */
export function planMirrors(paths: readonly string[], folder: string, mirrored: ReadonlyMap<string, string>, taken: (p: string) => boolean): PlannedMirror[] {
	const planned = new Set<string>();
	return paths.map((path) => {
		const at = mirrored.get(path);
		if (at !== undefined) return { path, to: at, state: 'mirrored' as const };
		const to = mirrorPath(folder, path);
		const free = !taken(to) && !planned.has(to.toLowerCase());
		planned.add(to.toLowerCase());
		return { path, to, state: free ? ('new' as const) : ('taken' as const) };
	});
}

/** How mirroring several files went, as a notice. `failed`: one line each. */
export function mirroredText(from: string, written: number, already: number, failed: readonly string[]): string {
	const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;
	const parts = [`Mirrored ${files(written)} from ${from}.`];
	if (already) parts.push(`${already} already mirrored.`);
	const lines = [parts.join(' ')];
	if (failed.length) lines.push('Not mirrored:', ...failed);
	return lines.join('\n');
}
