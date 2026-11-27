// A note's links (docs/features/links.md): the Obsidian side of links.ts. Converting writes
// them as the vault writes links; matching points the broken ones at notes of the vault.

import { App, getFrontMatterInfo, Notice, parseYaml, type CachedMetadata, type EventRef, type TFile } from 'obsidian';
import { errorText } from '../remote/vault-host.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { isRecord } from '../util/validate.ts';
import { rewriteLinks, type LinkRef } from './links.ts';
import { rewriterFor, writesWikilinks, type LinkWork } from './rewrite-run.ts';

export type { LinkWork } from './rewrite-run.ts';

/** How long to wait for Obsidian to read a note just written. */
const CACHE_WAIT_MS = 10_000;

/** What came of it: links changed, and of the broken ones, how many were matched, and how many not. */
interface LinkTally {
	changed: number;
	matched: number;
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
	const total: LinkTally = { changed: 0, matched: 0, none: 0 };
	for (const file of ready) {
		try {
			const t = await workOn(app, file, work);
			total.changed += t.changed;
			total.matched += t.matched;
			total.none += t.none;
		} catch (e) {
			failed.push(`${file.path}: ${errorText(e)}`);
		}
	}
	if (total.matched + total.none > 0) new Notice(matchText(total));
	// Stays until dismissed: it is the only record of it.
	if (failed.length) new Notice(['Links left as upstream wrote them in:', ...failed].join('\n'), 0);
}

/** The "Convert links in this note to the vault's link format" command. */
export async function convertActive(app: App): Promise<void> {
	const file = activeNote(app);
	if (!file) return;
	try {
		const { changed } = await workOn(app, file, { convert: true, match: false });
		const form = formName(writesWikilinks(app, file));
		new Notice(changed === 0 ? `No links to convert to ${form}.` : `Converted ${changed} ${plural(changed, 'link')} to ${form}.`);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** The "Match links in this note" command. */
export async function matchActive(app: App): Promise<void> {
	const file = activeNote(app);
	if (!file) return;
	try {
		new Notice(matchText(await workOn(app, file, { convert: false, match: true })));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** The "Fix links in this note" command: convert and match. */
export async function fixActive(app: App): Promise<void> {
	const file = activeNote(app);
	if (!file) return;
	try {
		new Notice(fixText(await workOn(app, file, { convert: true, match: true })));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/**
 * The active note; `null`, with a notice, when none is open. Mirrors too: links changed so, showing
 * the same words, aren't an edit, so an update still overwrites the mirror unasked.
 */
function activeNote(app: App): TFile | null {
	const file = app.workspace.getActiveFile();
	if (file?.extension === 'md') return file;
	new Notice('No note is open.');
	return null;
}

export function formName(wiki: boolean): string {
	return wiki ? 'wikilinks' : 'Markdown links';
}

function plural(n: number, word: string): string {
	return n === 1 ? word : `${word}s`;
}

/** The broken links matching left, as a sentence; empty when none. */
function leftText(t: LinkTally): string {
	return t.none ? ` ${t.none} ${t.none === 1 ? 'has' : 'have'} no note of its name.` : '';
}

/** What matching did, as a notice. */
function matchText(t: LinkTally): string {
	if (t.matched + t.none === 0) return 'No broken links.';
	return `Matched ${t.matched} ${plural(t.matched, 'link')}.${leftText(t)}`;
}

/** What converting and matching did, as a notice. */
function fixText(t: LinkTally): string {
	if (t.changed + t.none === 0) return 'No links to fix.';
	const matched = t.matched ? `, ${t.matched} by matching` : '';
	return `Fixed ${t.changed} ${plural(t.changed, 'link')}${matched}.${leftText(t)}`;
}

const NOT_READ = 'Obsidian has not read the note yet.';

/** Does `work` on the links of `file`, in one write. Throws why it couldn't. */
async function workOn(app: App, file: TFile, work: LinkWork): Promise<LinkTally> {
	if (!(await whenCached(app, file, CACHE_WAIT_MS))) throw new Error(NOT_READ);
	const refs = refsOf(app.metadataCache.getFileCache(file));
	const { rewrite: one } = rewriterFor(app, file, work);
	const tally = { matched: 0, none: 0 };
	const rewrite = (text: string) => {
		tally.matched = 0;
		tally.none = 0;
		return rewriteLinks(text, refs, (ref, line) => {
			const r = one(ref, line);
			if (r.matched) tally.matched++;
			else if (work.match && r.broken) tally.none++;
			return r.link;
		});
	};
	if (rewrite(await app.vault.cachedRead(file))?.changed === 0) return { changed: 0, ...tally };
	// `process` reads the file itself: the offsets are checked again against what it reads.
	let changed: number | null = null;
	await app.vault.process(file, (text) => {
		const now = rewrite(text);
		changed = now?.changed ?? null;
		return now?.text ?? text;
	});
	if (changed === null) throw new Error('The note changed meanwhile.');
	return { changed, ...tally };
}

/** The links and embeds Obsidian found in a note's body, in the form `rewriteLinks` takes. */
export function refsOf(cache: CachedMetadata | null): LinkRef[] {
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
