// A tag index: the tags of a commit's Markdown files, and its file (docs/features/tags.md). Pure.

import { isRecord } from '../util/validate.ts';

/** Covers the file's format and the rules in tags.ts: raise it when either changes. */
const VERSION = 1;

/** Repo path → tags as written, for each file read; `[]` for one without. A file not in it is unread. */
export type TagIndex = Map<string, readonly string[]>;

export function indexToJson(index: TagIndex): string {
	const files = Object.fromEntries([...index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
	return JSON.stringify({ version: VERSION, files });
}

/** The index in a file's text, or `null` if it isn't one of this version. */
export function indexFromJson(text: string): TagIndex | null {
	let v: unknown;
	try {
		v = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(v) || v.version !== VERSION || !isRecord(v.files)) return null;
	const index: TagIndex = new Map();
	for (const [path, tags] of Object.entries(v.files)) {
		if (Array.isArray(tags) && tags.every((t) => typeof t === 'string')) index.set(path, tags);
	}
	return index;
}

/** Blob → tags, from an index and its commit's tree (path → blob): the same text has the same tags, wherever it is. */
export function tagsByBlob(index: TagIndex, tree: ReadonlyMap<string, string>): Map<string, readonly string[]> {
	const out = new Map<string, readonly string[]>();
	for (const [path, tags] of index) {
		const blob = tree.get(path);
		if (blob !== undefined) out.set(blob, tags);
	}
	return out;
}
