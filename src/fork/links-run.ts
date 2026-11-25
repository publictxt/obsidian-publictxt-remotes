// A fork's links by name (docs/features/fork-links.md): the Obsidian side of links.ts.

import { App, getFrontMatterInfo, Notice, parseYaml, type CachedMetadata, type EventRef, type TFile } from 'obsidian';
import type { RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { isRecord } from '../util/validate.ts';
import { isForkOf } from './fork.ts';
import { linkByName, rewriteLinks, splitLink, upstreamFiles, upstreamTarget, type LinkRef, type UpstreamFiles } from './links.ts';

/** How long to wait for Obsidian to read a note just written. */
const CACHE_WAIT_MS = 10_000;

/**
 * Makes the links by path in the forks just `written` from the source `url` links by name, each
 * read against the source's files at the commit its note is from. A notice names the notes it
 * couldn't do. Never throws: the forks stand whatever happens here.
 */
export async function nameLinks(app: App, host: RemoteHost, url: string, written: readonly TFile[]): Promise<void> {
	const trees: Trees = new Map();
	const failed: string[] = [];
	for (const file of written) {
		try {
			await nameLinksIn(app, host, url, file, trees);
		} catch (e) {
			failed.push(`${file.path}: ${errorText(e)}`);
		}
	}
	// Stays until dismissed: it is the only record of it.
	if (failed.length) new Notice(['Links left as upstream wrote them in:', ...failed].join('\n'), 0);
}

/** The "Convert links in this note" command: the active fork. */
export async function nameLinksInActive(app: App, data: PublicTxtData): Promise<void> {
	const file = app.workspace.getActiveFile();
	const meta = file ? readForkMeta(app.metadataCache.getFileCache(file)?.frontmatter) : null;
	if (!file || !meta) {
		new Notice('This note is not a fork.');
		return;
	}
	const follow = scanFollows(app).follows.find((f) => isForkOf(meta, f));
	if (!follow) {
		new Notice('The source this note was forked from is not followed.');
		return;
	}
	try {
		const n = await nameLinksIn(app, vaultHost(app, data), follow.url, file, new Map());
		new Notice(n === 0 ? 'No links to convert.' : `Converted ${n} ${n === 1 ? 'link' : 'links'}.`);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** A source's files by commit, each read once. */
type Trees = Map<string, Promise<UpstreamFiles>>;

function filesAt(host: RemoteHost, url: string, commit: string, trees: Trees): Promise<UpstreamFiles> {
	let files = trees.get(commit);
	if (!files) {
		// `ls-tree` takes any tree-ish: a commit lists its tree. No fetch: the clone holds every tree.
		files = host.tree(url, commit).then((t) => upstreamFiles(t.files.keys()));
		trees.set(commit, files);
	}
	return files;
}

/** Puts the links by path in the fork `file` by name; how many it changed. Throws why it couldn't. */
async function nameLinksIn(app: App, host: RemoteHost, url: string, file: TFile, trees: Trees): Promise<number> {
	if (!(await whenCached(app, file, CACHE_WAIT_MS))) throw new Error('Obsidian has not read the note yet.');
	const cache = app.metadataCache.getFileCache(file);
	const refs = refsOf(cache);
	const meta = readForkMeta(cache?.frontmatter);
	if (!meta || refs.length === 0) return 0;
	if (!meta.commit) throw new Error('The commit it is from is not known.');
	const files = await filesAt(host, url, meta.commit, trees);
	const named = (text: string) =>
		rewriteLinks(text, refs, (ref) => {
			// Not upstream's, but a page of the vault: the user's own link.
			const upstream = upstreamTarget(ref, meta.path, files);
			if (upstream && 'none' in upstream && app.metadataCache.getFirstLinkpathDest(splitLink(ref.link).path, file.path)) return null;
			return linkByName(ref, meta.path, files);
		});
	if (named(await app.vault.cachedRead(file))?.changed === 0) return 0;
	// `process` reads the file itself: the offsets are checked again against what it reads.
	let changed: number | null = null;
	await app.vault.process(file, (text) => {
		const now = named(text);
		changed = now?.changed ?? null;
		return now?.text ?? text;
	});
	if (changed === null) throw new Error('The note changed meanwhile.');
	return changed;
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
 * Whether Obsidian's cache of `file` matches its text, waiting up to `ms` for it to: the note
 * reads as a fork of the blob its text says, and every cached link is where the cache says it
 * is. A note just forked is written twice (text, then front matter), and each write moves the
 * links. The blob tells an overwritten note from its old cache, which a note with no links would
 * otherwise match.
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
	const cached = readForkMeta(cache?.frontmatter);
	if (!cache || !cached) return false;
	const text = await app.vault.cachedRead(file);
	if (readForkMeta(frontMatterOf(text))?.blob !== cached.blob) return false;
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
