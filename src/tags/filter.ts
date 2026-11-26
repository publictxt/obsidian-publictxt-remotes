// Filtering pages by tags (docs/features/tags.md): chip states, match modes and counts, as in
// publictxt-facets. Pure. Tags here are in their `tagMatch` form.

import { tagMatch } from './tags.ts';

/** Whether a page needs all of the included tags, or any. */
export type TagMode = 'all' | 'any';

/** A filter is replaced, never changed in place. */
export interface TagFilter {
	readonly include: ReadonlySet<string>;
	readonly exclude: ReadonlySet<string>;
	readonly mode: TagMode;
}

export const NO_FILTER: TagFilter = { include: new Set(), exclude: new Set(), mode: 'all' };

export type ChipState = 'include' | 'exclude' | 'off';

/** Page path → its tags for matching (`matchTags`). */
export type PageTags = ReadonlyMap<string, ReadonlySet<string>>;

/** A page's tags for matching: each with the tags it is nested in (`dev/app`: `dev` too). */
export function matchTags(tags: readonly string[]): Set<string> {
	const out = new Set<string>();
	for (const tag of tags) {
		const parts = tagMatch(tag).split('/').filter((p) => p !== '');
		for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
	}
	return out;
}

/** Whether two filters let the same pages through. All or any only counts once two are included. */
export function sameFilter(a: TagFilter, b: TagFilter): boolean {
	const same = (x: ReadonlySet<string>, y: ReadonlySet<string>) => x.size === y.size && [...x].every((t) => y.has(t));
	return same(a.include, b.include) && same(a.exclude, b.exclude) && (a.include.size < 2 || a.mode === b.mode);
}

export function isSet(f: TagFilter): boolean {
	return f.include.size > 0 || f.exclude.size > 0;
}

export function chipState(f: TagFilter, tag: string): ChipState {
	return f.include.has(tag) ? 'include' : f.exclude.has(tag) ? 'exclude' : 'off';
}

/** A press on a chip includes its tag, or on its ✕ excludes it. One that is set is cleared: by its chip either way, by its ✕ when excluded. */
export function press(f: TagFilter, tag: string, on: 'chip' | 'x'): TagFilter {
	const was = chipState(f, tag);
	const include = new Set(f.include);
	const exclude = new Set(f.exclude);
	include.delete(tag);
	exclude.delete(tag);
	if (on === 'chip' && was === 'off') include.add(tag);
	if (on === 'x' && was !== 'exclude') exclude.add(tag);
	return { ...f, include, exclude };
}

/** Whether a page with `tags` passes: none of the excluded, and all or any of the included. */
export function passes(f: TagFilter, tags: ReadonlySet<string>): boolean {
	return passesExclude(f, tags) && passesInclude(f, tags);
}

function passesExclude(f: TagFilter, tags: ReadonlySet<string>): boolean {
	return ![...f.exclude].some((t) => tags.has(t));
}

function passesInclude(f: TagFilter, tags: ReadonlySet<string>): boolean {
	if (!f.include.size) return true;
	const included = [...f.include];
	return f.mode === 'any' ? included.some((t) => tags.has(t)) : included.every((t) => tags.has(t));
}

/** Those of `paths` that pass. A path not in `pages` has no tags to go by, and never does. */
export function passing(paths: readonly string[], pages: PageTags, f: TagFilter): string[] {
	return paths.filter((p) => {
		const tags = pages.get(p);
		return tags !== undefined && passes(f, tags);
	});
}

/** A tag offered as a chip. */
export interface Chip {
	tag: string;
	state: ChipState;
	/** Pages it stands for, given the filter. */
	count: number;
}

/**
 * A chip per tag, most used first, then by name: an order the filter doesn't change. Its count
 * is of the pages that pass; for **any**, where including more adds pages, of those the included
 * tags don't narrow. A set tag no page has any more comes last, so it can be cleared.
 */
export function chips(pages: PageTags, f: TagFilter): Chip[] {
	const total = new Map<string, number>();
	const count = new Map<string, number>();
	for (const tags of pages.values()) {
		const counted = f.mode === 'any' ? passesExclude(f, tags) : passes(f, tags);
		for (const t of tags) {
			total.set(t, (total.get(t) ?? 0) + 1);
			if (counted) count.set(t, (count.get(t) ?? 0) + 1);
		}
	}
	const collator = new Intl.Collator();
	const order = [...total.keys()].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || collator.compare(a, b));
	const gone = [...f.include, ...f.exclude].filter((t) => !total.has(t));
	return [...order, ...gone].map((tag) => ({ tag, state: chipState(f, tag), count: count.get(tag) ?? 0 }));
}

/** Chips shown before "more". */
export const CHIP_LIMIT = 20;

/** The chips to draw: those with `typed` in their tag, the first `CHIP_LIMIT` unless `all`, and any that are set. */
export function shownChips(list: readonly Chip[], typed: string, all: boolean): { shown: Chip[]; more: number } {
	const query = tagMatch(typed.trim().replace(/^#/, ''));
	const found = list.filter((c) => c.state !== 'off' || c.tag.includes(query));
	const shown = found.filter((c, i) => all || i < CHIP_LIMIT || c.state !== 'off');
	return { shown, more: found.length - shown.length };
}
