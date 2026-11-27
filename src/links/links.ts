// A note's links (docs/features/links.md): written as the vault writes links, pointed at
// another note. Pure.

import { baseName, decoded, linkShows, splitLink, WIKI } from '../copy/link-text.ts';

/** A link or embed in a note's body, as Obsidian's metadata cache gives it. */
export interface LinkRef {
	/** Offsets of `original` in the note's text. */
	start: number;
	end: number;
	/** The link as written: `[[a#b|c]]`, `[c](a.md#b)`, `![[a]]`. */
	original: string;
	/** Its target with any subpath, without a wikilink's alias: `a#b`, `a.md#b`. */
	link: string;
}

export function isWikilink(original: string): boolean {
	return /^!?\[\[/.test(original);
}

/** A path as a Markdown link's target, as Obsidian writes it: spaces and the like encoded, and `(` `)`. */
function hrefOf(path: string): string {
	return encodeURI(path).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/%5E/g, '^');
}

/**
 * The path of a link to a note, decoded; `null` when it is a web link, within the note, or may not
 * be to a note (another extension; a Markdown link without `.md`, perhaps to a folder).
 */
export function notePath(ref: Pick<LinkRef, 'original' | 'link'>): string | null {
	const path = decoded(splitLink(ref.link).path).trim();
	if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
	if (/\.md$/i.test(path)) return path;
	return isWikilink(ref.original) && !path.endsWith('/') && !/\.[a-z][a-z0-9]{0,4}$/i.test(path) ? path : null;
}

/** What Obsidian matches a link to a note by: the note's name, without its folder, `.md` or case. */
export function nameOf(path: string): string {
	return baseName(path).replace(/\.md$/i, '').toLowerCase();
}

/** The path from the note at `from` to the file at `to`, both from the vault's root: `../cs/b.md`. */
export function relativePath(from: string, to: string): string {
	const dir = from.split('/').slice(0, -1);
	const target = to.split('/');
	let same = 0;
	while (same < dir.length && same < target.length - 1 && dir[same] === target[same]) same++;
	return [...dir.slice(same).map(() => '..'), ...target.slice(same)].join('/');
}

/** What a path in a link can't hold. */
const NOT_IN_PATH = /[[\]|#^]/;

/** A link cut around its path: what is before it, the path, and the rest (subpath, alias, title, end). */
const WIKI_PATH = /^(!?\[\[)([^\]|#\\]*)(.*)$/s;
const MARKDOWN_PATH = /^(!?\[.*\]\()(<[^>#]*|[^)\s#<]*)(.*)$/s;

interface Cut {
	before: string;
	angle: boolean;
	rest: string;
}

/** The link cut around its path. `null`: not safe to change. */
function cutLink(ref: Pick<LinkRef, 'original' | 'link'>): Cut | null {
	const wiki = isWikilink(ref.original);
	const m = (wiki ? WIKI_PATH : MARKDOWN_PATH).exec(ref.original);
	const [before, written, rest] = [m?.[1], m?.[2], m?.[3]];
	if (before === undefined || written === undefined || rest === undefined) return null;
	// An alias with a `]`: what it shows can't be read.
	if (wiki && !WIKI.test(ref.original)) return null;
	const angle = written.startsWith('<');
	const path = decoded(angle ? written.slice(1) : written).trim();
	// Cut elsewhere than Obsidian cuts it: a `)` in the path, an encoded `#`.
	if (path !== decoded(splitLink(ref.link).path).trim()) return null;
	return { before, angle, rest };
}

/**
 * The link in the other form, to `to` (a path without `.md`), showing the same words. `null` when
 * that form can't hold it: a title, words that can't be an alias or a link's text.
 */
function otherForm(original: string, cut: Cut, to: string, pipe: string): string | null {
	const shows = linkShows(original);
	const embed = original.startsWith('!') ? '!' : '';
	if (isWikilink(original)) {
		const subpath = /^(#.*?)?(?:\\?\|.*)?\]\]$/s.exec(cut.rest)?.[1] ?? '';
		return /[[\]\n]/.test(shows) ? null : `${embed}[${shows}](${hrefOf(to)}.md${hrefOf(subpath)})`;
	}
	const end = /^(#[^>)"]*)?>?\)$/.exec(cut.rest);
	const subpath = decoded(end?.[1] ?? '');
	if (!end || /[|\]]/.test(subpath) || /[|\n]|\]\]|\]$/.test(shows)) return null;
	return withShown(`${embed}[[${to}${subpath}]]`, shows, pipe);
}

/** The wikilink, with `shows` as its alias when it would show something else. */
function withShown(wikilink: string, shows: string, pipe: string): string {
	return linkShows(wikilink) === shows ? wikilink : `${wikilink.slice(0, -2)}${pipe}${shows}]]`;
}

/** An alias's `|` in `line`: escaped in a table. */
function pipeIn(line: string): string {
	return /^\s*\|/.test(line) ? '\\|' : '|';
}

/**
 * The link as the vault writes links (`wiki`: wikilinks, else Markdown), to the same path and
 * showing the same words. `null`: it is already, or is left: not to a note, or the other form
 * can't hold it.
 */
export function reformat(ref: Pick<LinkRef, 'original' | 'link'>, wiki: boolean, line: string): string | null {
	const path = notePath(ref)?.replace(/\.md$/i, '');
	if (!path || isWikilink(ref.original) === wiki || NOT_IN_PATH.test(path)) return null;
	const cut = cutLink(ref);
	return cut && otherForm(ref.original, cut, path, pipeIn(line));
}

/**
 * The link pointed at `to` (a path without `.md`), as the vault writes links, showing the same
 * words. When the other form can't hold it, it keeps its own. `null`: left.
 */
export function relink(ref: Pick<LinkRef, 'original' | 'link'>, to: string, wiki: boolean, line: string): string | null {
	const cut = cutLink(ref);
	if (!cut || NOT_IN_PATH.test(to)) return null;
	const isWiki = isWikilink(ref.original);
	const other = isWiki === wiki ? null : otherForm(ref.original, cut, to, pipeIn(line));
	if (other !== null) return other;
	if (isWiki) return withShown(`${cut.before}${to}${cut.rest}`, linkShows(ref.original), pipeIn(line));
	return `${cut.before}${cut.angle ? '<' : ''}${hrefOf(to)}.md${cut.rest}`;
}

/**
 * `text` with each of its links `refs` as `rewrite` gives it, from its line (`null`: as it is),
 * and how many changed. `null` when a ref's offsets don't hold its `original`: the cache is stale.
 */
export function rewriteLinks(text: string, refs: readonly LinkRef[], rewrite: (ref: LinkRef, line: string) => string | null): { text: string; changed: number } | null {
	if (refs.some((r) => text.slice(r.start, r.end) !== r.original)) return null;
	let out = text;
	let from = text.length;
	let changed = 0;
	for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
		// A link holding one already rewritten (an image as its text) is left.
		if (ref.end > from) continue;
		const end = text.indexOf('\n', ref.end);
		const next = rewrite(ref, text.slice(text.lastIndexOf('\n', ref.start - 1) + 1, end < 0 ? undefined : end));
		if (next === null || next === ref.original) continue;
		out = out.slice(0, ref.start) + next + out.slice(ref.end);
		from = ref.start;
		changed++;
	}
	return { text: out, changed };
}
