// A fork's links (docs/features/fork-links.md): what upstream file a link names, the link rewritten
// as the vault writes links, and whether two texts differ only in their links. Pure.

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
 * to a file (an external URL, or a link within the note). See docs/features/fork-links.md → Reading a link.
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

/** What a name in a link can't hold. */
const NOT_IN_NAME = /[[\]|#^]/;

/** A path as a Markdown link's target, as Obsidian writes it: spaces and the like encoded, and `(` `)`. */
function hrefOf(path: string): string {
	return encodeURI(path).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/%5E/g, '^');
}

/** A link by `name` (no `.md`) as the cache would give it. */
function refByName(name: string, wiki: boolean): Pick<LinkRef, 'original' | 'link'> {
	return wiki ? { original: `[[${name}]]`, link: name } : { original: `[x](${hrefOf(name)}.md)`, link: `${name}.md` };
}

/**
 * The shortest name for a link to the upstream note `path`: the end of its path (`b`, `cs/b`,
 * `wiki/cs/b`) that upstream reads back as `path` from the note forked from `forkPath`. `null`:
 * not a note, or no end of its path does.
 */
export function shortestName(path: string, forkPath: string, files: UpstreamFiles, wiki: boolean): string | null {
	const stem = path.replace(/\.md$/i, '');
	if (stem === path || NOT_IN_NAME.test(stem)) return null;
	const parts = stem.split('/');
	for (let i = parts.length - 1; i >= 0; i--) {
		const name = parts.slice(i).join('/');
		const back = upstreamTarget(refByName(name, wiki), forkPath, files);
		if (back && 'path' in back && back.path === path) return name;
	}
	return null;
}

/**
 * The name of a note that is no file upstream (a page not written yet), from the link `ref` to it.
 * `null` when it may not be a note (a wikilink with another extension, a Markdown link without
 * `.md`: perhaps a folder), or upstream reads the name as something.
 */
export function missingName(ref: Pick<LinkRef, 'original' | 'link'>, forkPath: string, files: UpstreamFiles, wiki: boolean): string | null {
	const file = baseName(decoded(splitLink(ref.link).path).trim());
	const isNote = /\.md$/i.test(file) || (isWikilink(ref.original) && !/\.[a-z0-9]{1,5}$/i.test(file));
	const name = file.replace(/\.md$/i, '');
	if (!isNote || !name || NOT_IN_NAME.test(name)) return null;
	const back = upstreamTarget(refByName(name, wiki), forkPath, files);
	return back && 'none' in back && back.none === 'missing' ? name : null;
}

/** A link cut around its path: what is before it, the path, and the rest (subpath, alias, title, end). */
const WIKI_PATH = /^(!?\[\[)([^\]|#\\]*)(.*)$/s;
const MARKDOWN_PATH = /^(!?\[.*\]\()(<[^>#]*|[^)\s#<]*)(.*)$/s;

/**
 * The link `ref` pointed at `to` (a link path without `.md`), as a wikilink or a Markdown link as
 * the vault writes them (`wiki`). What it shows, its subpath and `!` are kept. When the other form
 * can't hold the rest of it (a title; words that can't be an alias or a link's text), it keeps its
 * form and only its path changes. `line`: the line it is in, to escape an alias's `|` in a table.
 * `null`: left as it is.
 */
export function relink(ref: Pick<LinkRef, 'original' | 'link'>, to: string, wiki: boolean, line: string): string | null {
	const isWiki = isWikilink(ref.original);
	const m = (isWiki ? WIKI_PATH : MARKDOWN_PATH).exec(ref.original);
	const [before, written, rest] = [m?.[1], m?.[2], m?.[3]];
	if (before === undefined || written === undefined || rest === undefined || NOT_IN_NAME.test(to)) return null;
	// An alias with a `]`: what it shows can't be read.
	if (isWiki && !WIKI.test(ref.original)) return null;
	const angle = written.startsWith('<');
	const path = decoded(angle ? written.slice(1) : written).trim();
	// Cut elsewhere than Obsidian cuts it (a `)` in the path, an encoded `#`): not safe to change.
	if (path !== decoded(splitLink(ref.link).path).trim()) return null;
	const pipe = /^\s*\|/.test(line) ? '\\|' : '|';
	const shows = linkShows(ref.original);
	const embed = ref.original.startsWith('!') ? '!' : '';
	if (isWiki && !wiki) {
		const subpath = /^(#.*?)?(?:\\?\|.*)?\]\]$/s.exec(rest)?.[1] ?? '';
		if (!/[[\]\n]/.test(shows)) return `${embed}[${shows}](${hrefOf(to)}.md${hrefOf(subpath)})`;
	}
	if (!isWiki && wiki) {
		const end = /^(#[^>)"]*)?>?\)$/.exec(rest);
		const subpath = decoded(end?.[1] ?? '');
		if (end && !/[|\]]/.test(subpath) && !/[|\n]|\]\]|\]$/.test(shows)) return withShown(`${embed}[[${to}${subpath}]]`, shows, pipe);
	}
	if (!isWiki) return `${before}${angle ? '<' : ''}${hrefOf(to)}.md${rest}`;
	// In the case it was written in, which is what the link shows; Obsidian doesn't mind.
	const tail = path.replace(/\.md$/i, '').slice(-to.length);
	return withShown(`${before}${tail.toLowerCase() === to.toLowerCase() ? tail : to}${rest}`, shows, pipe);
}

/** The wikilink, with `shows` as its alias when it would show something else. */
function withShown(wikilink: string, shows: string, pipe: string): string {
	return linkShows(wikilink) === shows ? wikilink : `${wikilink.slice(0, -2)}${pipe}${shows}]]`;
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
