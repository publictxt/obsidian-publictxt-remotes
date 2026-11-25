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
