// Converting a fork's links (docs/plans/convert-links.md): what upstream file a link names, what
// it shows, and rewriting a note's links. Pure.

/** A link or embed in a note's body, as Obsidian's metadata cache gives it. */
export interface LinkRef {
	/** Offsets of `original` in the note's text. */
	start: number;
	end: number;
	/** The line it starts on, from 0. */
	line: number;
	/** The link as written: `[[a#b|c]]`, `[c](a.md#b)`, `![[a]]`. */
	original: string;
	/** Its target with any subpath, without a wikilink's alias: `a#b`, `a.md#b`. */
	link: string;
	embed: boolean;
}

/**
 * Why a link is left as it is: its upstream note has no copy and no link by name fits; its target
 * isn't a note (an image); or it is no one file upstream and can't be a link by its own name.
 */
export type Left = 'unforked' | 'not-note' | 'unconvertible';

/** Each reason, as the notice and the report say it. */
export const LEFT_TEXT: Record<Left, string> = {
	unforked: 'no name fits',
	'not-note': 'not a note',
	unconvertible: 'cannot be converted',
};

/** A link left as it is, and why. */
export interface LeftLink {
	line: number;
	original: string;
	why: Left;
}

/**
 * A call converting made that may not be what upstream meant: the link's name is several files
 * upstream, so it went by name; or it already pointed at a copy, which was kept although
 * upstream reads it as another file.
 */
export type Check = 'several' | 'kept';

/** Each call, as the notice and the report say it. */
export const CHECK_TEXT: Record<Check, string> = {
	several: 'several by name',
	kept: 'kept on your copy',
};

/** A link converting made a call on: as it is after converting, and which call. */
export interface CheckLink {
	line: number;
	link: string;
	why: Check;
}

function noLeft(): Record<Left, number> {
	return { unforked: 0, 'not-note': 0, unconvertible: 0 };
}

/** `link` cut at its first `#`: the path, and the subpath with its `#` (`''`: none). */
export function splitLink(link: string): { path: string; subpath: string } {
	const hash = link.indexOf('#');
	return hash < 0 ? { path: link, subpath: '' } : { path: link.slice(0, hash), subpath: link.slice(hash) };
}

export function isWikilink(original: string): boolean {
	return /^!?\[\[/.test(original);
}

/** The upstream files a link is read against, indexed for the lookups `upstreamTarget` makes. */
export interface UpstreamFiles {
	exact: ReadonlySet<string>;
	/** Lower-cased path → paths. */
	lower: ReadonlyMap<string, readonly string[]>;
	/** Lower-cased file name → paths. */
	byName: ReadonlyMap<string, readonly string[]>;
}

export function upstreamFiles(paths: Iterable<string>): UpstreamFiles {
	const exact = new Set<string>();
	const lower = new Map<string, string[]>();
	const byName = new Map<string, string[]>();
	const add = (m: Map<string, string[]>, k: string, p: string) => {
		const list = m.get(k);
		if (list) list.push(p);
		else m.set(k, [p]);
	};
	for (const p of paths) {
		if (exact.has(p)) continue;
		exact.add(p);
		add(lower, p.toLowerCase(), p);
		add(byName, baseName(p).toLowerCase(), p);
	}
	return { exact, lower, byName };
}

function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

function folderOf(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash < 0 ? '' : path.slice(0, slash);
}

/** `rel` from `folder`, with `.` and `..` worked out; `null` if it climbs out of the repo. */
function join(folder: string, rel: string): string | null {
	const parts = folder ? folder.split('/') : [];
	for (const seg of rel.split('/')) {
		if (seg === '' || seg === '.') continue;
		if (seg === '..') {
			if (parts.length === 0) return null;
			parts.pop();
		} else parts.push(seg);
	}
	return parts.length ? parts.join('/') : null;
}

function decoded(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

/**
 * The upstream path a link in the note forked from `forkPath` names, as upstream would read it,
 * or why there is no one file there: `missing` (none) or `several` (several by name). `null`: not a link
 * to a file (an external URL, or a link within the note). See docs/plans/convert-links.md → Resolving a link, step 2.
 */
export function upstreamTarget(ref: Pick<LinkRef, 'original' | 'link'>, forkPath: string, files: UpstreamFiles): { path: string } | { none: 'missing' | 'several' } | null {
	const raw = splitLink(ref.link).path.trim();
	if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
	const wiki = isWikilink(ref.original);
	const tried = new Set<string>();
	for (const p of [raw, decoded(raw)]) {
		if (tried.has(p)) continue;
		tried.add(p);
		const folder = folderOf(forkPath);
		let paths: (string | null)[];
		let byName = false;
		if (/^\.\.?\//.test(p)) paths = [join(folder, p)];
		else if (p.startsWith('/')) paths = [join('', p)];
		else {
			paths = wiki ? [join('', p), join(folder, p)] : [join(folder, p), join('', p)];
			byName = true;
		}
		for (const caseless of [false, true]) {
			for (const c of paths) {
				const hit = c === null ? null : lookUp(files, c, caseless);
				if (hit) return { path: hit };
			}
			if (!byName) continue;
			const named = lookUpByName(files, p, caseless);
			if (named.length === 1 && named[0] !== undefined) return { path: named[0] };
			if (named.length > 1) return { none: 'several' };
		}
	}
	return { none: 'missing' };
}

/** `path` or `path.md` if a file upstream; caseless: the one file it names without regard to case. */
function lookUp(files: UpstreamFiles, path: string, caseless: boolean): string | null {
	for (const c of [path, `${path}.md`]) {
		if (!caseless) {
			if (files.exact.has(c)) return c;
			continue;
		}
		const hits = files.lower.get(c.toLowerCase());
		if (hits?.length === 1 && hits[0] !== undefined) return hits[0];
	}
	return null;
}

/** The files whose path is `name` or ends in `/` + `name` (or with `.md` added). */
function lookUpByName(files: UpstreamFiles, name: string, caseless: boolean): string[] {
	const found = new Set<string>();
	for (const n of [name, `${name}.md`]) {
		const want = caseless ? n.toLowerCase() : n;
		for (const p of files.byName.get(baseName(n).toLowerCase()) ?? []) {
			const have = caseless ? p.toLowerCase() : p;
			if (have === want || have.endsWith(`/${want}`)) found.add(p);
		}
	}
	return [...found];
}

const WIKI = /^!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]$/s;
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

/** How the vault writes links (Settings → Files and links → Use [[Wikilinks]]). */
export type LinkStyle = 'wiki' | 'markdown';

/** What a link by name can't hold in its name. */
const NOT_IN_NAME = /[[\]|#^]/;

/** A link by `name` (no `.md`) in `style`, as written and as the cache would give it. */
function byName(name: string, style: LinkStyle): Pick<LinkRef, 'original' | 'link'> {
	return style === 'wiki' ? { original: `[[${name}]]`, link: name } : { original: `[x](${hrefOf(name)}.md)`, link: `${name}.md` };
}

/** A path as a Markdown link's target, as Obsidian writes it: spaces and the like encoded, and `(` `)`. */
function hrefOf(path: string): string {
	return encodeURI(path).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * The shortest name for a link to the upstream note `path` that has no copy in the vault: the
 * end of its path (`b`, `cs/b`, `wiki/cs/b`) that upstream reads back as `path` from the note
 * forked from `forkPath`, written in `style` (which upstream reads in its own order). So once the
 * note is forked, the link converts to the copy. Until then Obsidian takes it by name: it lands on
 * a vault note of that name, or dangles. The wiki way. `null`: not a note.
 */
export function danglingName(path: string, forkPath: string, files: UpstreamFiles, style: LinkStyle): string | null {
	const stem = path.replace(/\.md$/i, '');
	if (stem === path || NOT_IN_NAME.test(stem)) return null;
	const parts = stem.split('/');
	for (let i = parts.length - 1; i >= 0; i--) {
		const name = parts.slice(i).join('/');
		const back = upstreamTarget(byName(name, style), forkPath, files);
		if (back && 'path' in back && back.path === path) return name;
	}
	return null;
}

/** `[[name#subpath]]`, with `shows` as its alias when it would show something else. `null`: `shows` can't be an alias. */
export function wikilink(name: string, subpath: string, shows: string): string | null {
	const plain = `[[${name}${subpath}]]`;
	if (linkShows(plain) === shows) return plain;
	return /\||\]\]|\n/.test(shows) ? null : `[[${name}${subpath}|${shows}]]`;
}

/** `[shows](name.md#subpath)`, encoded as Obsidian writes it. `null`: `shows` can't be a link's text. */
export function markdownLink(name: string, subpath: string, shows: string): string | null {
	if (/[[\]\n]/.test(shows)) return null;
	return `[${shows}](${hrefOf(name)}.md${subpath ? `#${hrefOf(subpath.slice(1))}` : ''})`;
}

/**
 * A link to the upstream note `path`, which has no copy in the vault, by name (`danglingName`) in
 * the vault's `style`, showing what it showed. `null`: it already is one, in that style and by
 * name (not `./`, `../` or `/`), which upstream reads as that note. Left as it is when no link
 * will do: not a note, or its words can't be the link's.
 */
export function danglingLink(ref: Pick<LinkRef, 'original' | 'link'>, path: string, forkPath: string, files: UpstreamFiles, style: LinkStyle): { dangling: string } | { left: 'unforked' | 'not-note' } | null {
	if (!/\.md$/i.test(path)) return { left: 'not-note' };
	const { subpath } = splitLink(ref.link);
	if (inStyleByName(ref, style)) return null;
	const name = danglingName(path, forkPath, files, style);
	const link = name === null ? null : linkByName(name, subpath, ref.original, style);
	return link === null ? { left: 'unforked' } : { dangling: link };
}

/** Whether a link is in `style` and by name (no `./`, `../` or leading `/`): Obsidian takes it by name. */
function inStyleByName(ref: Pick<LinkRef, 'original' | 'link'>, style: LinkStyle): boolean {
	return isWikilink(ref.original) === (style === 'wiki') && !/^\.{0,2}\//.test(splitLink(ref.link).path);
}

/**
 * A link to a note that is no file upstream either (a page not written yet), by its own name in
 * the vault's `style`: it lands on the vault's note of that name, or dangles. The wiki way.
 * `null`: it already is one. Left when its target isn't a note, or its words can't be the link's.
 */
export function missingLink(ref: Pick<LinkRef, 'original' | 'link'>, style: LinkStyle): { dangling: string } | { left: 'unconvertible' | 'not-note' } | null {
	const { path, subpath } = splitLink(ref.link);
	const file = baseName(decoded(path).trim());
	const ext = /\.([a-z0-9]{1,5})$/i.exec(file)?.[1];
	if (ext !== undefined && ext.toLowerCase() !== 'md') return { left: 'not-note' };
	if (inStyleByName(ref, style)) return null;
	const name = file.replace(/\.md$/i, '');
	const link = !name || NOT_IN_NAME.test(name) ? null : linkByName(name, subpath, ref.original, style);
	return link === null ? { left: 'unconvertible' } : { dangling: link };
}

/** A link by `name` in `style`, to `subpath`, showing what `original` showed. `null`: its words can't be the link's. */
function linkByName(name: string, subpath: string, original: string, style: LinkStyle): string | null {
	const shows = linkShows(original);
	return style === 'wiki' ? wikilink(name, decoded(subpath), shows) : markdownLink(name, decoded(subpath), shows);
}

/** What becomes of a link: its new text, a dangling wikilink, why it is left, or `null`: right as it is. */
export type LinkOutcome = string | { dangling: string } | { left: Left } | null;

/** A link's outcome, and the call made on it when there was one. */
export type LinkPlan = LinkOutcome | { check: Check; then: LinkOutcome };

/** What `convertLinks` did: links rewritten (`dangling` of them to notes not forked), those left, and those a call was made on. */
export interface Converted {
	text: string;
	converted: number;
	dangling: number;
	/** The links left, in the order they appear. */
	leftLinks: LeftLink[];
	/** The links a call was made on, as they are now, in the order they appear. */
	checkLinks: CheckLink[];
}

/** What converting a note with no links did. */
export function nothingConverted(text: string): Converted {
	return { text, converted: 0, dangling: 0, leftLinks: [], checkLinks: [] };
}

/** Over several notes: what `convertLinks` did, the notes it changed, and those whose cache was stale. */
export interface LinkTally {
	converted: number;
	dangling: number;
	left: Record<Left, number>;
	check: number;
	notes: number;
	stale: string[];
}

export function emptyTally(): LinkTally {
	return { converted: 0, dangling: 0, left: noLeft(), check: 0, notes: 0, stale: [] };
}

/** Adds one note's result to `t`. `null`: its cache was stale. */
export function addToTally(t: LinkTally, note: string, c: Converted | null): void {
	if (!c) {
		t.stale.push(note);
		return;
	}
	t.converted += c.converted;
	t.dangling += c.dangling;
	t.check += c.checkLinks.length;
	if (c.converted > 0) t.notes++;
	for (const l of c.leftLinks) t.left[l.why]++;
}

/** What a conversion did, as a notice. `many`: over several notes, so it says how many changed. */
export function tallyText(t: LinkTally, many: boolean): string {
	const n = (k: number, one: string, more = `${one}s`) => `${k} ${k === 1 ? one : more}`;
	const lines: string[] = [];
	if (t.converted === 0) lines.push('No links to convert.');
	else {
		const dangling = t.dangling ? `, ${t.dangling} to notes you don't have yet` : '';
		lines.push(`Converted ${n(t.converted, 'link')}${many ? ` in ${n(t.notes, 'note')}` : ''}${dangling}.`);
	}
	const left = (Object.keys(LEFT_TEXT) as Left[]).filter((k) => t.left[k] > 0).map((k) => `${t.left[k]} ${LEFT_TEXT[k]}`);
	if (left.length) lines.push(`Left: ${left.join(', ')}. See "Links to fix" in the follow note.`);
	if (t.check) lines.push(`${n(t.check, 'link')} to check: see "Links to check" in the follow note.`);
	if (t.stale.length) lines.push(`Changed while converting, try again: ${t.stale.join(', ')}.`);
	return lines.join(' ');
}

/**
 * Rewrites the links `refs` in `text`. `plan(ref)` gives a link's new text (to a copy, or
 * dangling), why it is left, or `null` when it is right as it is, and any call made on it. A new
 * text equal to the old isn't counted. An embed stays an embed. `null` when a ref's offsets don't hold its `original`: the cache is stale.
 */
export function convertLinks(text: string, refs: readonly LinkRef[], plan: (ref: LinkRef) => LinkPlan): Converted | null {
	if (refs.some((r) => text.slice(r.start, r.end) !== r.original)) return null;
	const leftLinks: LeftLink[] = [];
	const checkLinks: CheckLink[] = [];
	let converted = 0;
	let dangling = 0;
	let out = text;
	for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
		const { check, then: p } = withCheck(plan(ref));
		let now = ref.original;
		if (p !== null && typeof p !== 'string' && 'left' in p) {
			leftLinks.push({ line: ref.line, original: ref.original, why: p.left });
		} else if (p !== null) {
			const link = typeof p === 'string' ? p : p.dangling;
			const next = ref.embed && !link.startsWith('!') ? `!${link}` : link;
			if (next !== ref.original) {
				out = out.slice(0, ref.start) + next + out.slice(ref.end);
				now = next;
				converted++;
				if (typeof p !== 'string') dangling++;
			}
		}
		if (check) checkLinks.push({ line: ref.line, link: now, why: check });
	}
	leftLinks.reverse();
	checkLinks.reverse();
	return { text: out, converted, dangling, leftLinks, checkLinks };
}

function withCheck(p: LinkPlan): { check: Check | null; then: LinkOutcome } {
	if (p === null || typeof p === 'string' || !('check' in p)) return { check: null, then: p };
	return p;
}

/** Every `[[…]]` and `[…](…)`, embedded or not. Read the same way on both sides of a compare. */
const ANY_LINK = /!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)/g;

/** A link's `#…`, decoded: a wikilink's before its `|`, a Markdown link's in its target. */
function linkSubpath(original: string): string {
	const wiki = WIKI.exec(original);
	const target = wiki ? (wiki[1] ?? '') : (MARKDOWN.exec(original)?.[2] ?? '');
	return decoded(splitLink(target).subpath);
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
