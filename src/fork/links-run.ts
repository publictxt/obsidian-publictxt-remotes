// A fork's links (docs/features/fork-links.md): the Obsidian side of links.ts. Converting writes
// them as the vault writes links; matching points the broken ones at notes of the vault.

import { App, getFrontMatterInfo, Notice, parseYaml, type CachedMetadata, type EventRef, type TFile } from 'obsidian';
import { errorText } from '../remote/vault-host.ts';
import { readForkMeta, readMirrorMeta } from '../sources/fork-meta.ts';
import { isRecord } from '../util/validate.ts';
import { nameOf, notePath, reformat, relink, rewriteLinks, splitLink, type LinkRef } from './links.ts';

/** How long to wait for Obsidian to read a note just written. */
const CACHE_WAIT_MS = 10_000;

/** What to do with a note's links. */
export interface LinkWork {
	/** Write them as the vault writes links, to the same paths. */
	convert: boolean;
	/** Point those Obsidian finds no note by at the one note of that name. */
	match: boolean;
}

/** What came of it: links changed, and of the broken ones, how many were matched, or why not. */
interface LinkTally {
	changed: number;
	matched: number;
	several: number;
	none: number;
}

/**
 * Does `work` on the links of the forks just `written`. A notice says what it couldn't do, and
 * what matching left. Never throws: the forks stand whatever happens here.
 */
export async function linkNew(app: App, written: readonly TFile[], work: LinkWork): Promise<void> {
	if (!work.convert && !work.match) return;
	const failed: string[] = [];
	const ready: TFile[] = [];
	// All of them first: they may link to each other.
	for (const file of written) {
		if (await whenCached(app, file, CACHE_WAIT_MS)) ready.push(file);
		else failed.push(`${file.path}: ${NOT_READ}`);
	}
	const total: LinkTally = { changed: 0, matched: 0, several: 0, none: 0 };
	for (const file of ready) {
		try {
			const t = await workOn(app, file, work);
			total.changed += t.changed;
			total.matched += t.matched;
			total.several += t.several;
			total.none += t.none;
		} catch (e) {
			failed.push(`${file.path}: ${errorText(e)}`);
		}
	}
	if (total.matched + total.several + total.none > 0) new Notice(matchText(total));
	// Stays until dismissed: it is the only record of it.
	if (failed.length) new Notice(['Links left as upstream wrote them in:', ...failed].join('\n'), 0);
}

/** The "Convert links in this note" command: the active fork. */
export async function convertActive(app: App): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file || !readForkMeta(app.metadataCache.getFileCache(file)?.frontmatter)) {
		new Notice('This note is not a fork.');
		return;
	}
	try {
		const { changed } = await workOn(app, file, { convert: true, match: false });
		new Notice(changed === 0 ? 'No links to convert.' : `Converted ${changed} ${changed === 1 ? 'link' : 'links'}.`);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** The "Match links in this note" command: the active note, unless it is a mirror. */
export async function matchActive(app: App): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file || file.extension !== 'md') {
		new Notice('No note is open.');
		return;
	}
	if (readMirrorMeta(app.metadataCache.getFileCache(file)?.frontmatter)) {
		new Notice('This note is a mirror: its links stay as upstream wrote them.');
		return;
	}
	try {
		new Notice(matchText(await workOn(app, file, { convert: false, match: true })));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** What matching did, as a notice. */
function matchText(t: LinkTally): string {
	if (t.matched + t.several + t.none === 0) return 'No broken links.';
	const left: string[] = [];
	if (t.several) left.push(`${t.several} ${t.several === 1 ? 'has' : 'have'} several matches`);
	if (t.none) left.push(`${t.none} ${t.none === 1 ? 'has' : 'have'} none`);
	return `Matched ${t.matched} ${t.matched === 1 ? 'link' : 'links'}.${left.length ? ` ${left.join(', ')}.` : ''}`;
}

const NOT_READ = 'Obsidian has not read the note yet.';

/** Does `work` on the links of `file`, in one write. Throws why it couldn't. */
async function workOn(app: App, file: TFile, work: LinkWork): Promise<LinkTally> {
	if (!(await whenCached(app, file, CACHE_WAIT_MS))) throw new Error(NOT_READ);
	const refs = refsOf(app.metadataCache.getFileCache(file));
	const { matches, several, none } = work.match ? matchesFor(app, file, refs) : { matches: new Map<LinkRef, TFile>(), several: 0, none: 0 };
	// Obsidian's setting isn't public API: ask it for a link and see which kind comes back.
	const wiki = app.fileManager.generateMarkdownLink(file, file.path).startsWith('[[');
	let matched = 0;
	const rewrite = (text: string) => {
		matched = 0;
		return rewriteLinks(text, refs, (ref, line) => {
			const to = matches.get(ref);
			const link = to ? relink(ref, app.metadataCache.fileToLinktext(to, file.path, true), wiki, line) : null;
			if (link !== null) matched++;
			return link ?? (work.convert ? reformat(ref, wiki, line) : null);
		});
	};
	if (rewrite(await app.vault.cachedRead(file))?.changed === 0) return { changed: 0, matched, several, none };
	// `process` reads the file itself: the offsets are checked again against what it reads.
	let changed: number | null = null;
	await app.vault.process(file, (text) => {
		const now = rewrite(text);
		changed = now?.changed ?? null;
		return now?.text ?? text;
	});
	if (changed === null) throw new Error('The note changed meanwhile.');
	return { changed, matched, several, none };
}

/** The links of `file` Obsidian finds no note by: the one note of the name each has, and how many have several or none. */
function matchesFor(app: App, file: TFile, refs: readonly LinkRef[]): { matches: Map<LinkRef, TFile>; several: number; none: number } {
	const byName = new Map<string, TFile[]>();
	for (const f of app.vault.getMarkdownFiles()) byName.set(nameOf(f.path), [...(byName.get(nameOf(f.path)) ?? []), f]);
	const matches = new Map<LinkRef, TFile>();
	let several = 0;
	let none = 0;
	for (const ref of refs) {
		const path = notePath(ref);
		if (path === null || app.metadataCache.getFirstLinkpathDest(splitLink(ref.link).path, file.path)) continue;
		const named = byName.get(nameOf(path)) ?? [];
		const [only] = named;
		if (!only) none++;
		else if (named.length > 1) several++;
		else matches.set(ref, only);
	}
	return { matches, several, none };
}

/** The links and embeds Obsidian found in a note's body, in the form `rewriteLinks` takes. */
function refsOf(cache: CachedMetadata | null): LinkRef[] {
	const refs: LinkRef[] = [];
	for (const r of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
		refs.push({ start: r.position.start.offset, end: r.position.end.offset, original: r.original, link: r.link });
	}
	return refs;
}

/**
 * Whether Obsidian's cache of `file` matches its text, waiting up to `ms` for it to: both give
 * the same fork, if it is one, and every cached link is where the cache says it is. A note just
 * forked is written twice (text, then front matter), and each write moves the links. The blob
 * tells an overwritten note from its old cache, which a note with no links would otherwise match.
 */
async function whenCached(app: App, file: TFile, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	for (;;) {
		if (await isCached(app, file)) return true;
		const left = deadline - Date.now();
		if (left <= 0) return false;
		await nextChange(app, file, left);
	}
}

async function isCached(app: App, file: TFile): Promise<boolean> {
	const cache = app.metadataCache.getFileCache(file);
	if (!cache) return false;
	const text = await app.vault.cachedRead(file);
	if (readForkMeta(frontMatterOf(text))?.blob !== readForkMeta(cache.frontmatter)?.blob) return false;
	return refsOf(cache).every((r) => text.slice(r.start, r.end) === r.original);
}

/** `text`'s front matter, parsed; `undefined` when it has none or it isn't valid YAML. */
function frontMatterOf(text: string): Record<string, unknown> | undefined {
	const fm = getFrontMatterInfo(text);
	if (!fm.exists) return undefined;
	try {
		const front: unknown = parseYaml(fm.frontmatter);
		return isRecord(front) ? front : undefined;
	} catch {
		return undefined;
	}
}

/** Resolves when Obsidian next reads `file`, or after `ms`. */
function nextChange(app: App, file: TFile, ms: number): Promise<void> {
	return new Promise((done) => {
		let ref: EventRef | null = null;
		const finish = () => {
			window.clearTimeout(timer);
			if (ref) app.metadataCache.offref(ref);
			done();
		};
		const timer = window.setTimeout(finish, ms);
		ref = app.metadataCache.on('changed', (f) => {
			if (f.path === file.path) finish();
		});
	});
}
