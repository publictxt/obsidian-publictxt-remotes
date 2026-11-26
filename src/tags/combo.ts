// Tag combos: the lines of a follow note's `follow_tags` (docs/features/tags.md). Pure.

import { tagMatch } from './tags.ts';

/** A page matches when it has every tag of `tags` and none of `not`. Tags as written, without `#`. */
export interface TagCombo {
	readonly tags: readonly string[];
	readonly not: readonly string[];
}

/** A line such as `books -fiction` → its combo, or `null` if it has no tag. Each tag once, by `tagMatch`. */
export function parseCombo(line: string): TagCombo | null {
	const tags = new Map<string, string>();
	const not = new Map<string, string>();
	for (const word of line.trim().split(/\s+/)) {
		const out = word.startsWith('-') ? not : tags;
		const tag = word.replace(/^-/, '').replace(/^#/, '');
		if (tag !== '' && !out.has(tagMatch(tag))) out.set(tagMatch(tag), tag);
	}
	if (!tags.size && !not.size) return null;
	return { tags: [...tags.values()], not: [...not.values()] };
}

/** A combo as its line: its tags, then each left out with `-`. */
export function comboText(c: TagCombo): string {
	return [...c.tags, ...c.not.map((t) => `-${t}`)].join(' ');
}

/** Front matter `follow_tags` → its combos: a list, or one string. A line said twice, in any order or case, is kept once. */
export function readCombos(v: unknown): TagCombo[] {
	const list: unknown[] = Array.isArray(v) ? v : [v];
	return addCombos([], list.map((line) => (typeof line === 'string' ? parseCombo(line) : null)).filter((c): c is TagCombo => c !== null));
}

/** `combos`, then those of `more` not among them. */
export function addCombos(combos: readonly TagCombo[], more: readonly TagCombo[]): TagCombo[] {
	const keys = new Set(combos.map(comboKey));
	const out = [...combos];
	for (const c of more) {
		if (keys.has(comboKey(c))) continue;
		keys.add(comboKey(c));
		out.push(c);
	}
	return out;
}

/** The same for any combo with the same tags, whatever their order or case. */
export function comboKey(c: TagCombo): string {
	const sorted = (xs: readonly string[]) => xs.map(tagMatch).sort().join(' ');
	return `${sorted(c.tags)} -${sorted(c.not)}`;
}
