// Follow notes: one per source in follows/ (docs/spec.md → Source; publictext spec §3.2).
// Pure: front matter in, sources out, and back.

import { normalizeSource, type Source } from './schema.ts';

/** Where follow notes live. Fixed by the spec, not a setting. */
export const FOLLOWS_FOLDER = 'follows';

/** A source and the note it came from. */
export interface Follow extends Source {
	path: string;
}

export interface FollowScan {
	/** By path, byte order; the first note for a URL. */
	follows: Follow[];
	/** Later notes for a URL already followed. */
	duplicates: Follow[];
	/** Follow notes without a valid `url`. */
	invalid: string[];
}

/** A vault path that may be a follow note. */
export function isFollowPath(path: string): boolean {
	return path.startsWith(`${FOLLOWS_FOLDER}/`) && path.endsWith('.md');
}

/** A follow note's front matter → its source, or `null` if it has no valid `url`. */
export function readFollow(frontmatter: unknown): Source | null {
	return normalizeSource(frontmatter);
}

/**
 * The front matter keys to write for `s`. `undefined` means remove the key, so a cleared field
 * leaves no empty key behind.
 */
export function followProps(s: Source): Record<string, string | string[] | undefined> {
	return {
		url: s.url,
		branch: s.branch ?? undefined,
		include: s.include.length ? s.include : undefined,
		watch: s.watch.length ? s.watch : undefined,
		folder: s.folder ?? undefined,
	};
}

/** Applies `followProps(s)` to a front matter object in place; other keys are kept. */
export function writeFollow(frontmatter: Record<string, unknown>, s: Source): void {
	for (const [k, v] of Object.entries(followProps(s))) {
		if (v === undefined) delete frontmatter[k];
		else frontmatter[k] = v;
	}
}

/** Notes in `follows/` → follows, duplicates and invalid notes. */
export function collectFollows(notes: { path: string; frontmatter: unknown }[]): FollowScan {
	const sorted = notes.filter((n) => isFollowPath(n.path)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const out: FollowScan = { follows: [], duplicates: [], invalid: [] };
	const seen = new Set<string>();
	for (const n of sorted) {
		const s = readFollow(n.frontmatter);
		if (!s) out.invalid.push(n.path);
		else if (seen.has(s.url)) out.duplicates.push({ ...s, path: n.path });
		else {
			seen.add(s.url);
			out.follows.push({ ...s, path: n.path });
		}
	}
	return out;
}

/** `follows/<owner>-<repo>.md` for a canonical URL. */
export function followNotePath(url: string): string {
	const [owner = '', repo = ''] = new URL(url).pathname.split('/').filter(Boolean);
	return `${FOLLOWS_FOLDER}/${owner}-${repo}.md`;
}
