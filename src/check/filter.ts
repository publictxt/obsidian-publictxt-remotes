// What the check view's filter leaves of a check (docs/features/check.md#filter): each filter is
// a test a file passes or not, and they all narrow the same lists. Pure.

import { isCopyable } from '../copy/copy.ts';
import { passes, type PageTags, type TagFilter } from '../tags/filter.ts';
import type { SourceCheck } from './check.ts';

/** Whether a file stays listed: `status` is its change's in what's new, `null` in all files. */
export type Keep = (path: string, status: string | null) => boolean;

/** `c` with only the changes and files that pass every test: what the lists show, and their tick boxes are of. */
export function kept(c: SourceCheck, keeps: readonly Keep[]): SourceCheck {
	if (!keeps.length) return c;
	const keep: Keep = (path, status) => keeps.every((k) => k(path, status));
	return { ...c, changes: c.changes.filter((ch) => keep(ch.path, ch.status)), files: c.files.filter((p) => keep(p, null)) };
}

/**
 * Pages with the tags `f` asks for; `pages`: their tags, `null` while not known, when only
 * removals pass. Only pages pass, and news is let through when in doubt: a removed page has no
 * tags at head, and one that couldn't be read might match.
 */
export function byTag(pages: PageTags | null, f: TagFilter): Keep {
	return (path, status) => {
		if (status === 'removed') return true;
		if (pages === null || !isCopyable(path)) return false;
		const tags = pages.get(path);
		return tags === undefined ? status !== null : passes(f, tags);
	};
}

/** Which files to show by the copies the user has of them. */
export type Copies = 'all' | 'mirrored' | 'forked' | 'neither';

export const COPIES: readonly Copies[] = ['all', 'mirrored', 'forked', 'neither'];

/** Files with a mirror, a fork, or neither, as `c` knows them; `null` for `all`. */
export function byCopy(c: SourceCheck, show: Copies): Keep | null {
	switch (show) {
		case 'all':
			return null;
		case 'mirrored':
			return (path) => c.mirrored.has(path);
		case 'forked':
			return (path) => c.forked.has(path);
		case 'neither':
			return (path) => !c.mirrored.has(path) && !c.forked.has(path);
	}
}
