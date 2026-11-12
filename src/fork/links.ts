// Converting a fork's links (docs/plans/convert-links.md): what upstream file a link names, what
// it shows, and rewriting a note's links. Pure.

/** A link or embed in a note's body, as Obsidian's metadata cache gives it. */
export interface LinkRef {
	/** Offsets of `original` in the note's text. */
	start: number;
	end: number;
	/** The link as written: `[[a#b|c]]`, `[c](a.md#b)`, `![[a]]`. */
	original: string;
	/** Its target with any subpath, without a wikilink's alias: `a#b`, `a.md#b`. */
	link: string;
	embed: boolean;
}

/** Why a link is left as it is: its upstream file has no copy, is no file upstream, or can't be told. */
export type Left = 'unforked' | 'missing' | 'unclear';

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
 * or why there is none. `null`: not a link to a file (an external URL, or a link within the
 * note). See docs/plans/convert-links.md → Resolving a link, step 2.
 */
export function upstreamTarget(ref: Pick<LinkRef, 'original' | 'link'>, forkPath: string, files: UpstreamFiles): { path: string } | { left: 'missing' | 'unclear' } | null {
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
			if (named.length > 1) return { left: 'unclear' };
		}
	}
	return { left: 'missing' };
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

/** What wikilinks can't hold in their name. */
const NOT_IN_WIKILINK = /[[\]|#^]/;

/**
 * The shortest name for a wikilink to the upstream note `path` that has no copy in the vault:
 * the end of its path (`b`, `cs/b`, `wiki/cs/b`) that upstream reads back as `path` from the note
 * forked from `forkPath`. So once the note is forked, the link converts to the copy. Until then
 * it dangles, or lands on a vault note of that name: the wiki way. `null`: not a note.
 */
export function danglingName(path: string, forkPath: string, files: UpstreamFiles): string | null {
	const stem = path.replace(/\.md$/i, '');
	if (stem === path || NOT_IN_WIKILINK.test(stem)) return null;
	const parts = stem.split('/');
	for (let i = parts.length - 1; i >= 0; i--) {
		const name = parts.slice(i).join('/');
		const back = upstreamTarget({ original: `[[${name}]]`, link: name }, forkPath, files);
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

/**
 * A link to the upstream note `path`, which has no copy in the vault, as a wikilink by name
 * (`danglingName`) showing what it showed. `null`: it already is a wikilink, which upstream reads
 * as that note. Left as it is when no wikilink will do (not a note, or its words can't be an alias).
 */
export function danglingLink(ref: Pick<LinkRef, 'original' | 'link'>, path: string, forkPath: string, files: UpstreamFiles): { dangling: string } | { left: 'unforked' } | null {
	if (isWikilink(ref.original)) return null;
	const name = danglingName(path, forkPath, files);
	const { subpath } = splitLink(ref.link);
	const link = name === null ? null : wikilink(name, decoded(subpath), linkShows(ref.original));
	return link === null ? { left: 'unforked' } : { dangling: link };
}

/** What becomes of a link: its new text, a dangling wikilink, why it is left, or `null`: right as it is. */
export type LinkPlan = string | { dangling: string } | { left: Left } | null;

/** What `convertLinks` did: links rewritten (`dangling` of them to notes not forked), and those left, by why. */
export interface Converted {
	text: string;
	converted: number;
	dangling: number;
	left: Record<Left, number>;
}

/** Over several notes: what `convertLinks` did, the notes it changed, and those whose cache was stale. */
export interface LinkTally {
	converted: number;
	dangling: number;
	left: Record<Left, number>;
	notes: number;
	stale: string[];
}

export function emptyTally(): LinkTally {
	return { converted: 0, dangling: 0, left: { unforked: 0, missing: 0, unclear: 0 }, notes: 0, stale: [] };
}

/** Adds one note's result to `t`. `null`: its cache was stale. */
export function addToTally(t: LinkTally, note: string, c: Converted | null): void {
	if (!c) {
		t.stale.push(note);
		return;
	}
	t.converted += c.converted;
	t.dangling += c.dangling;
	if (c.converted > 0) t.notes++;
	for (const k of Object.keys(t.left) as Left[]) t.left[k] += c.left[k];
}

/** What a conversion did, as a notice. `many`: over several notes, so it says how many changed. */
export function tallyText(t: LinkTally, many: boolean): string {
	const n = (k: number, one: string, more = `${one}s`) => `${k} ${k === 1 ? one : more}`;
	const lines: string[] = [];
	if (t.converted === 0) lines.push('No links to convert.');
	else {
		const dangling = t.dangling ? `, ${t.dangling} to notes not forked yet` : '';
		lines.push(`Converted ${n(t.converted, 'link')}${many ? ` in ${n(t.notes, 'note')}` : ''}${dangling}.`);
	}
	const left = [
		t.left.unforked ? `${t.left.unforked} not forked` : '',
		t.left.missing ? `${t.left.missing} not in the source` : '',
		t.left.unclear ? `${t.left.unclear} unclear` : '',
	].filter((s) => s !== '');
	if (left.length) lines.push(`Left: ${left.join(', ')}.`);
	if (t.stale.length) lines.push(`Changed while converting, try again: ${t.stale.join(', ')}.`);
	return lines.join(' ');
}

/**
 * Rewrites the links `refs` in `text`. `plan(ref)` gives a link's new text (to a copy, or
 * dangling), why it is left, or `null` when it is right as it is. A new text equal to the old isn't counted. An embed stays an
 * embed. `null` when a ref's offsets don't hold its `original`: the cache is stale.
 */
export function convertLinks(text: string, refs: readonly LinkRef[], plan: (ref: LinkRef) => LinkPlan): Converted | null {
	if (refs.some((r) => text.slice(r.start, r.end) !== r.original)) return null;
	const left: Record<Left, number> = { unforked: 0, missing: 0, unclear: 0 };
	let converted = 0;
	let dangling = 0;
	let out = text;
	for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
		const p = plan(ref);
		if (p === null) continue;
		if (typeof p !== 'string' && 'left' in p) {
			left[p.left]++;
			continue;
		}
		const link = typeof p === 'string' ? p : p.dangling;
		const next = ref.embed && !link.startsWith('!') ? `!${link}` : link;
		if (next === ref.original) continue;
		out = out.slice(0, ref.start) + next + out.slice(ref.end);
		converted++;
		if (typeof p !== 'string') dangling++;
	}
	return { text: out, converted, dangling, left };
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
export function sameWords(a: string, b: string): boolean {
	return a.startsWith('!') === b.startsWith('!') && linkShows(a) === linkShows(b) && linkSubpath(a) === linkSubpath(b);
}

/**
 * Whether `note` is `forked` with only its links written differently: the text between links is
 * the same piece for piece, there are as many links, and each pair is equal or `sameLink`.
 */
export function matchesExceptLinks(note: string, forked: string, sameLink: (noteLink: string, forkedLink: string) => boolean = sameWords): boolean {
	if (note === forked) return true;
	const a = cut(note);
	const b = cut(forked);
	if (a.links.length !== b.links.length) return false;
	if (a.text.some((t, i) => t !== b.text[i])) return false;
	return a.links.every((l, i) => {
		const f = b.links[i] ?? '';
		return l === f || sameLink(l, f);
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
