// Followed tags at a check (docs/features/tags.md): which changes match a source's tag combos,
// by the tags of their old and new versions. Pure.

import { isCopyable } from '../copy/copy.ts';
import type { Change } from '../remote/host.ts';
import type { TagCombo } from './combo.ts';
import { matchTags, passes, type TagFilter } from './filter.ts';
import type { TagIndex } from './tag-index.ts';
import { tagMatch } from './tags.ts';

/** A combo as a filter: all of its tags, none of those left out. */
export function comboFilter(c: TagCombo): TagFilter {
	return { include: new Set(c.tags.map(tagMatch)), exclude: new Set(c.not.map(tagMatch)), mode: 'all' };
}

/** Whether a page with these tags (as `matchTags` gives them) matches any of `combos`. */
export function matchesAny(combos: readonly TagCombo[], tags: ReadonlySet<string>): boolean {
	return combos.some((c) => passes(comboFilter(c), tags));
}

/** A change's version before it, if there is one to go by: not for one added, and not when every file is listed. */
function oldPath(ch: Change, listsAll: boolean): string | null {
	if (listsAll || ch.status === 'added') return null;
	return ch.status === 'renamed' ? ch.from : ch.path;
}

/** A change's version at head, if it has one. */
function newPath(ch: Change): string | null {
	return ch.status === 'removed' ? null : ch.path;
}

const pages = (paths: (string | null)[]): string[] => [...new Set(paths.filter((p): p is string => p !== null && isCopyable(p)))];

/** The pages whose tags matching needs: at head, and at the commit last seen. `listsAll`: every file is listed (`reason`). */
export function pagesToRead(changes: readonly Change[], listsAll: boolean): { head: string[]; seen: string[] } {
	return { head: pages(changes.map(newPath)), seen: pages(changes.map((ch) => oldPath(ch, listsAll))) };
}

/**
 * The paths of the changes that match: their version at head or before does, so a page that loses
 * a tag, or is removed, still shows. A page that couldn't be read (not in its index) matches; a
 * file that isn't a page never does.
 */
export function followedChanges(changes: readonly Change[], combos: readonly TagCombo[], head: TagIndex, seen: TagIndex, listsAll: boolean): Set<string> {
	const matches = (path: string | null, index: TagIndex) => {
		if (path === null || !isCopyable(path)) return false;
		const tags = index.get(path);
		return tags === undefined || matchesAny(combos, matchTags(tags));
	};
	return new Set(changes.filter((ch) => matches(newPath(ch), head) || matches(oldPath(ch, listsAll), seen)).map((ch) => ch.path));
}
