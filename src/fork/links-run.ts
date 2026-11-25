// A fork's links as the vault writes them (docs/features/fork-links.md): the Obsidian side of links.ts.

import { App, getFrontMatterInfo, Notice, parseYaml, type CachedMetadata, type EventRef, type TFile } from 'obsidian';
import { latestFirst } from '../check/check.ts';
import type { RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import { scanForks, scanMirrors } from '../sources/forks.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { isRecord } from '../util/validate.ts';
import { isForkOf, type Remote } from './fork.ts';
import { missingName, relink, rewriteLinks, shortestName, splitLink, upstreamFiles, upstreamTarget, type LinkRef, type UpstreamFiles } from './links.ts';

/** How long to wait for Obsidian to read a note just written. */
const CACHE_WAIT_MS = 10_000;

/**
 * Converts the links in the forks just `written` from `remote`. A notice names the notes it
 * couldn't do. Never throws: the forks stand whatever happens here.
 */
export async function convertNew(app: App, host: RemoteHost, remote: Remote, written: readonly TFile[]): Promise<void> {
	const failed: string[] = [];
	const ready: TFile[] = [];
	// All of them first: they may link to each other, and a fork not read yet isn't known as a copy.
	for (const file of written) {
		if (await whenCached(app, file, CACHE_WAIT_MS)) ready.push(file);
		else failed.push(`${file.path}: Obsidian has not read the note yet.`);
	}
	const source = new SourceLinks(app, host, remote);
	for (const file of ready) {
		try {
			await source.convert(file, true);
		} catch (e) {
			failed.push(`${file.path}: ${errorText(e)}`);
		}
	}
	// Stays until dismissed: it is the only record of it.
	if (failed.length) new Notice(['Links left as upstream wrote them in:', ...failed].join('\n'), 0);
}

/** The "Convert links in this note" command: the active fork. */
export async function convertActive(app: App, data: PublicTxtData): Promise<void> {
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
		const n = await new SourceLinks(app, vaultHost(app, data), follow).convert(file, false);
		new Notice(n === 0 ? 'No links to convert.' : `Converted ${n} ${n === 1 ? 'link' : 'links'}.`);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** Converts links in the forks of one source. Its copies are read once, and its files once a commit. */
class SourceLinks {
	private readonly app: App;
	private readonly host: RemoteHost;
	private readonly remote: Remote;
	private readonly copies: { path: string; meta: { path: string } }[];
	private readonly trees = new Map<string, Promise<UpstreamFiles>>();

	constructor(app: App, host: RemoteHost, remote: Remote) {
		this.app = app;
		this.host = host;
		this.remote = remote;
		// The copy of a page is its newest fork, else its mirror.
		this.copies = [...latestFirst(scanForks(app)), ...scanMirrors(app)].filter((c) => isForkOf(c.meta, remote));
	}

	/**
	 * Converts the links in the fork `file`; how many it changed. `fresh`: its links are as upstream
	 * wrote them. Throws why it couldn't.
	 */
	async convert(file: TFile, fresh: boolean): Promise<number> {
		const { app } = this;
		if (!(await whenCached(app, file, CACHE_WAIT_MS))) throw new Error('Obsidian has not read the note yet.');
		const cache = app.metadataCache.getFileCache(file);
		const refs = refsOf(cache);
		const meta = readForkMeta(cache?.frontmatter);
		if (!meta || refs.length === 0) return 0;
		if (!meta.commit) throw new Error('The commit it is from is not known.');
		const files = await this.filesAt(meta.commit);
		// Obsidian's setting isn't public API: ask it for a link and see which kind comes back.
		const wiki = app.fileManager.generateMarkdownLink(file, file.path).startsWith('[[');
		const converted = (text: string) =>
			rewriteLinks(text, refs, (ref, line) => {
				const to = this.target(ref, file, meta.path, files, fresh, wiki);
				if (to === null) return null;
				return relink(ref, typeof to === 'string' ? to : app.metadataCache.fileToLinktext(to, file.path, true), wiki, line);
			});
		if (converted(await app.vault.cachedRead(file))?.changed === 0) return 0;
		// `process` reads the file itself: the offsets are checked again against what it reads.
		let changed: number | null = null;
		await app.vault.process(file, (text) => {
			const now = converted(text);
			changed = now?.changed ?? null;
			return now?.text ?? text;
		});
		if (changed === null) throw new Error('The note changed meanwhile.');
		return changed;
	}

	/** The note a link in `file` goes to, or a name for one the vault may not have; `null`: the link is left. */
	private target(ref: LinkRef, file: TFile, forkPath: string, files: UpstreamFiles, fresh: boolean, wiki: boolean): TFile | string | null {
		const upstream = upstreamTarget(ref, forkPath, files);
		if (upstream === null) return null;
		const found = this.app.metadataCache.getFirstLinkpathDest(splitLink(ref.link).path, file.path);
		// Converted already, so its path is the vault's: upstream could read it as another page.
		if (!fresh && found && this.copies.some((c) => c.path === found.path)) return found;
		if ('path' in upstream) {
			const copy = upstream.path === forkPath ? file : this.copyOf(upstream.path);
			return copy ?? shortestName(upstream.path, forkPath, files, wiki);
		}
		// No one page upstream: what the vault has there, else a page not written yet.
		if (found) return found.extension === 'md' ? found : null;
		return missingName(ref, forkPath, files, wiki);
	}

	/** The vault's copy of the upstream page `path`: its newest fork, else its mirror. */
	private copyOf(path: string): TFile | null {
		const [copy] = this.copies.filter((c) => c.meta.path === path);
		return copy ? this.app.vault.getFileByPath(copy.path) : null;
	}

	/** The source's files at `commit`. No fetch: the clone holds every tree, and `ls-tree` takes any tree-ish. */
	private filesAt(commit: string): Promise<UpstreamFiles> {
		let files = this.trees.get(commit);
		if (!files) {
			files = this.host.tree(this.remote.url, commit).then((t) => upstreamFiles(t.files.keys()));
			this.trees.set(commit, files);
		}
		return files;
	}
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
