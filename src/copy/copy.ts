// What forks and mirrors have in common: both are copies of a source's file (docs/naming.md). Pure.

import type { Head } from '../remote/host.ts';
import type { ForkMeta } from '../sources/fork-meta.ts';

/** A followed remote: its key (`Source.url`) and its name. */
export interface Remote {
	url: string;
	name: string;
}

/** The source to fork or mirror from, as a check saw it. */
export interface CopySource {
	/** The source's key (`Source.url`). */
	url: string;
	/** The source's remote name. */
	name: string;
	/** The head to read from: the last check's, or one just read. `null`: only mirrors are forked, which are in the vault. */
	head: Head | null;
	/** The source's mirror folder, under the community folder; `null`: its name. */
	folder: string | null;
}

/** Only Markdown has front matter to record where a copy came from. */
export function isCopyable(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

/**
 * Whether `meta` is a fork or a mirror from `remote`: by its remote name when it has one (names
 * compared without case, as file names are), else by its repo.
 */
export function isFrom(meta: Pick<ForkMeta, 'remote' | 'repo'>, remote: Remote): boolean {
	if (meta.remote !== null) return meta.remote.toLowerCase() === remote.name.toLowerCase();
	return meta.repo === remote.url;
}

/** The copies of `path` in `remote`. */
export function copiesOf<T extends { meta: Pick<ForkMeta, 'remote' | 'repo' | 'path'> }>(copies: readonly T[], remote: Remote, path: string): T[] {
	return copies.filter((c) => isFrom(c.meta, remote) && c.meta.path === path);
}

/** The copies of each upstream file of `remote`: upstream path → its copies. Both in the order given. */
export function copiesByPath<T extends { meta: Pick<ForkMeta, 'remote' | 'repo' | 'path'> }>(copies: readonly T[], remote: Remote): Map<string, T[]> {
	const byPath = new Map<string, T[]>();
	for (const c of copies) {
		if (!isFrom(c.meta, remote)) continue;
		const same = byPath.get(c.meta.path);
		if (same) same.push(c);
		else byPath.set(c.meta.path, [c]);
	}
	return byPath;
}

/** Copies by their vault path, in byte order: of a file copied more than once, the same one is first everywhere. */
export function inPathOrder<T extends { path: string }>(copies: readonly T[]): T[] {
	return [...copies].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The first copy given of each upstream file of `remote`, by upstream path. */
export function firstByPath<T extends { meta: Pick<ForkMeta, 'remote' | 'repo' | 'path'> }>(copies: readonly T[], remote: Remote): Map<string, T> {
	const out = new Map<string, T>();
	for (const [path, [first]] of copiesByPath(copies, remote)) {
		if (first) out.set(path, first);
	}
	return out;
}
