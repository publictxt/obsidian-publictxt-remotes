// Reading a link's text: its parts, what it shows, and whether two texts differ only in how their
// links are written (docs/features/links.md). Pure.

/** `link` cut at its first `#`: the path, and the subpath with its `#` (`''`: none). */
export function splitLink(link: string): { path: string; subpath: string } {
	const hash = link.indexOf('#');
	return hash < 0 ? { path: link, subpath: '' } : { path: link.slice(0, hash), subpath: link.slice(hash) };
}

/** The last part of a path. */
export function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

/** `s` with its percent-encoding decoded; as it is when that isn't valid. */
export function decoded(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

/** A whole wikilink: its target, and its alias if it has one. */
export const WIKI = /^!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]$/s;
/** A whole Markdown link: its text and its target. */
const MARKDOWN = /^!?\[(.*)\]\((.*)\)$/s;

/**
 * What a link shows when read: a Markdown link's text; a wikilink's alias, else its file's name
 * without `.md` and its subpath as Obsidian shows it (`b#H` → `b > H`).
 */
export function linkShows(original: string): string {
	const wiki = WIKI.exec(original);
	if (wiki) {
		if (wiki[2] !== undefined) return wiki[2];
		const { path, subpath } = splitLink(wiki[1] ?? '');
		const name = baseName(path).replace(/\.md$/i, '');
		const parts = subpath.split('#').filter((s) => s !== '');
		return [name, ...parts].filter((s) => s !== '').join(' > ');
	}
	return MARKDOWN.exec(original)?.[1] ?? original;
}

/** Every `[[…]]` and `[…](…)`, embedded or not. Read the same way on both sides of a compare. */
const ANY_LINK = /!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)/g;

/** A link's `#…`, decoded: a wikilink's before its `|`, a Markdown link's in its target. */
function linkSubpath(original: string): string {
	const wiki = WIKI.exec(original);
	const target = wiki ? (wiki[1] ?? '') : (MARKDOWN.exec(original)?.[2] ?? '');
	// In a table the pipe after it is escaped.
	return decoded(splitLink(target).subpath).replace(/\\$/, '');
}

/** Two links that read the same: embedded alike, showing the same words, to the same `#…`. */
function sameWords(a: string, b: string): boolean {
	return a.startsWith('!') === b.startsWith('!') && linkShows(a) === linkShows(b) && linkSubpath(a) === linkSubpath(b);
}

/**
 * Whether `note` is `forked` with only its links written differently: the text between links is
 * the same piece for piece, there are as many links, and each pair is equal or `sameWords`.
 */
export function matchesExceptLinks(note: string, forked: string): boolean {
	if (note === forked) return true;
	const a = cut(note);
	const b = cut(forked);
	if (a.links.length !== b.links.length) return false;
	if (a.text.some((t, i) => t !== b.text[i])) return false;
	return a.links.every((l, i) => {
		const f = b.links[i] ?? '';
		return l === f || sameWords(l, f);
	});
}

/** `text` cut at its links: the pieces between them (one more than the links), and the links. */
function cut(text: string): { text: string[]; links: string[] } {
	const pieces: string[] = [];
	const links: string[] = [];
	let at = 0;
	for (const m of text.matchAll(ANY_LINK)) {
		pieces.push(text.slice(at, m.index));
		links.push(m[0]);
		at = m.index + m[0].length;
	}
	pieces.push(text.slice(at));
	return { text: pieces, links };
}
