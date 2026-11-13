// Follow notes: one per source in follows/ (docs/spec.md → Source; publictext spec §3.2).
// Pure: front matter in, sources out, and back.

import { normalizeSource, type Source } from './schema.ts';
import { isLocalRepo } from './repo-url.ts';

/** Where follow notes live. Fixed by the spec, not a setting. */
export const FOLLOWS_FOLDER = 'follows';

/** A source and the note it came from. */
export interface Follow extends Source {
	path: string;
	/** The remote name: the note's file name without `.md`. */
	name: string;
}

export interface FollowScan {
	/** By path, byte order; the first note for a URL or a name. */
	follows: Follow[];
	/** Later notes for a URL already followed, or with a name already taken. */
	duplicates: (Follow & { of: 'url' | 'name' })[];
	/** Follow notes without a valid `url`. */
	invalid: string[];
}

/** A vault path that may be a follow note. */
export function isFollowPath(path: string): boolean {
	return path.startsWith(`${FOLLOWS_FOLDER}/`) && path.endsWith('.md');
}

/** A follow note's remote name: its file name without `.md`. */
export function remoteName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
}

/** A follow note's front matter → its source, or `null` if it has no valid `url` and isn't local. */
export function readFollow(frontmatter: unknown, name: string | null = null): Source | null {
	return normalizeSource(frontmatter, name);
}

/**
 * The front matter keys to write for `s`. `undefined` means remove the key, so a cleared field
 * leaves no empty key behind.
 */
export function followProps(s: Source): Record<string, string | string[] | boolean | undefined> {
	const local = isLocalRepo(s.url);
	return {
		url: local ? undefined : s.url,
		local: local ? true : undefined,
		branch: s.branch ?? undefined,
		include: s.include.length ? s.include : undefined,
		folder: s.folder ?? undefined,
		list_forks: s.listForks ?? undefined,
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
	const urls = new Set<string>();
	// Names are file names: compared without case, as macOS and Windows do.
	const names = new Set<string>();
	for (const n of sorted) {
		const name = remoteName(n.path);
		const s = readFollow(n.frontmatter, name);
		if (!s) out.invalid.push(n.path);
		else if (urls.has(s.url)) out.duplicates.push({ ...s, path: n.path, name, of: 'url' });
		else if (names.has(name.toLowerCase())) out.duplicates.push({ ...s, path: n.path, name, of: 'name' });
		else {
			urls.add(s.url);
			names.add(name.toLowerCase());
			out.follows.push({ ...s, path: n.path, name });
		}
	}
	return out;
}

/** `follows/<name>.md`: the note of the remote named `name`. */
export function followNotePath(name: string): string {
	return `${FOLLOWS_FOLDER}/${name}.md`;
}
