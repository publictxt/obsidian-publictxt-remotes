// Whether a fork or a mirror was edited since it was made (docs/features/fork-update.md, mirror.md). Pure.

import { PROVENANCE_KEYS } from '../sources/fork-meta.ts';
import { isRecord } from '../util/validate.ts';
import { matchesExceptLinks } from './link-text.ts';

/** A note taken apart: its front matter parsed (`null`: none) and the text after it. */
export interface NoteParts {
	front: Record<string, unknown> | null;
	body: string;
}

/**
 * Whether `note` was edited since it was forked from `forked`: its body differs, or its front
 * matter does, leaving out the `fork_*` and `mirror_*` keys. Front matter is compared parsed, as Obsidian
 * rewrites the YAML when it adds the keys; the body without regard to blank lines at its start
 * or the kind of line ending, which the rewrite can also change. Links written differently
 * but showing the same words don't count: converting a fork's links is not an
 * edit, nor is Obsidian updating a link whose target moved.
 */
export function isEdited(note: NoteParts, forked: NoteParts): boolean {
	return !matchesExceptLinks(bodyOf(note), bodyOf(forked)) || !same(ownKeys(note.front), ownKeys(forked.front));
}

function bodyOf(n: NoteParts): string {
	return n.body.replace(/\r\n/g, '\n').replace(/^\n+/, '');
}

function ownKeys(front: Record<string, unknown> | null): Record<string, unknown> {
	return Object.fromEntries(Object.entries(front ?? {}).filter(([k]) => !PROVENANCE_KEYS.includes(k)));
}

/** Deep equality of parsed YAML: key order doesn't count, list order does. */
function same(a: unknown, b: unknown): boolean {
	if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
	if (Array.isArray(a) || Array.isArray(b)) {
		return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
	}
	if (!isRecord(a) || !isRecord(b)) return a === b;
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((k) => k in b && same(a[k], b[k]));
}
