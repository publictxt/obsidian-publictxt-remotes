// Converting forks' links in the vault (docs/plans/convert-links.md): the Obsidian side of
// links.ts. A link is read as upstream reads it and pointed at the vault's copy of its file.

import { App, Notice, TFile, type CachedMetadata, type EventRef } from 'obsidian';
import { latestFirst } from '../check/check.ts';
import type { RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import type { Fork, ForkMeta } from '../sources/fork-meta.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import { scanForks } from '../sources/forks.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { forksOf, isForkOf, type Remote } from './fork.ts';
import { withSection } from './fork-list.ts';
import { LINK_REPORT_HEADING, renderLinkReport, type NoteLinks } from './link-report.ts';
import { addToTally, convertLinks, danglingLink, emptyTally, linkShows, missingLink, nothingConverted, splitLink, tallyText, upstreamFiles, upstreamTarget, type Converted, type LinkPlan, type LinkRef, type LinkStyle, type LinkTally, type UpstreamFiles } from './links.ts';

/** One source's forks, and its files at each commit they were forked at, read once. */
class SourceLinks {
	readonly forks: Fork[];
	private readonly byPath: Map<string, Fork>;
	private readonly files = new Map<string, Promise<UpstreamFiles>>();
	private style: LinkStyle | null = null;

	private readonly app: App;
	private readonly host: RemoteHost;
	readonly follow: Remote;

	constructor(app: App, host: RemoteHost, follow: Remote, allForks: readonly Fork[]) {
		this.app = app;
		this.host = host;
		this.follow = follow;
		this.forks = allForks.filter((f) => isForkOf(f.meta, follow));
		this.byPath = new Map(this.forks.map((f) => [f.path, f]));
	}

	/**
	 * The source's files at `commit`, from its clone (no fetch: the clone holds every tree). When
	 * that can't be read (no commit, no clone, gone from history), the paths of its forks stand in.
	 */
	filesAt(commit: string | null): Promise<UpstreamFiles> {
		const key = commit ?? '';
		let files = this.files.get(key);
		if (!files) {
			files = this.readFiles(commit);
			this.files.set(key, files);
		}
		return files;
	}

	private async readFiles(commit: string | null): Promise<UpstreamFiles> {
		if (commit) {
			try {
				// `ls-tree` takes any tree-ish: a commit lists its tree.
				const tree = await this.host.tree(this.follow.url, commit);
				return upstreamFiles(tree.files.keys());
			} catch (e) {
				console.warn(`PublicTxt Remotes: reading ${this.follow.name} at ${commit}:`, e);
			}
		}
		return upstreamFiles(this.forks.map((f) => f.meta.path));
	}

	/** Converts the links in the fork `note`; with `write` false only counts them. `null`: the cache was stale. */
	async convertNote(file: TFile, meta: ForkMeta, write: boolean): Promise<Converted | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const refs = refsOf(cache);
		if (refs.length === 0) return nothingConverted('');
		const files = await this.filesAt(meta.commit);
		const plan = (ref: LinkRef) => this.planLink(ref, file, meta, files);
		const counted = convertLinks(await this.app.vault.cachedRead(file), refs, plan);
		if (!write || !counted || counted.converted === 0) return counted;
		// `process` reads the file itself: the offsets are checked again against what it reads.
		let result: Converted | null = null;
		await this.app.vault.process(file, (text) => {
			result = convertLinks(text, refs, plan);
			return result?.text ?? text;
		});
		return result;
	}

	/** A link's new text, why it is left, or `null` when it isn't a link to a file or is right as it is. */
	private planLink(ref: LinkRef, file: TFile, meta: ForkMeta, files: UpstreamFiles): LinkPlan {
		const upstream = upstreamTarget(ref, meta.path, files);
		if (upstream === null) return null;
		const { path, subpath } = splitLink(ref.link);
		// Already a link to a copy from this source: that copy is the target (a second run changes nothing).
		const local = this.app.metadataCache.getFirstLinkpathDest(path, file.path);
		const localCopy = local ? this.byPath.get(local.path) : undefined;
		let target: TFile | null;
		if (local && localCopy) {
			// Upstream reads it as another file: don't guess between them.
			if ('path' in upstream && upstream.path !== localCopy.meta.path) return { left: 'unclear' };
			target = local;
		} else {
			// No file upstream either: a link by its own name, the wiki way.
			if ('left' in upstream) return upstream.left === 'missing' ? missingLink(ref, this.styleFor(file)) : upstream;
			target = upstream.path === meta.path ? file : this.copyOf(upstream.path);
			// Not forked: a wikilink by name, which converts to the copy once it is forked.
			if (!target) return danglingLink(ref, upstream.path, meta.path, files, this.styleFor(file));
		}
		return this.linkTo(target, file.path, subpath, ref.original);
	}

	/**
	 * How the vault writes links. Obsidian's setting isn't public API, so ask it for a link to the
	 * note itself and see which kind comes back.
	 */
	private styleFor(file: TFile): LinkStyle {
		this.style ??= this.app.fileManager.generateMarkdownLink(file, file.path).startsWith('[[') ? 'wiki' : 'markdown';
		return this.style;
	}

	/** The vault file of the latest copy of the upstream file `path`. */
	private copyOf(path: string): TFile | null {
		const [latest] = latestFirst(forksOf(this.forks, this.follow, path));
		return latest ? this.app.vault.getFileByPath(latest.path) : null;
	}

	/** The link Obsidian writes to `target`, showing what `original` showed. */
	private linkTo(target: TFile, from: string, subpath: string, original: string): string {
		const fm = this.app.fileManager;
		const plain = fm.generateMarkdownLink(target, from, subpath || undefined);
		const shows = linkShows(original);
		return linkShows(plain) === shows ? plain : fm.generateMarkdownLink(target, from, subpath || undefined, shows);
	}
}

/** The links and embeds Obsidian found in a note's body, in the form `convertLinks` takes. */
function refsOf(cache: CachedMetadata | null): LinkRef[] {
	const refs: LinkRef[] = [];
	for (const [list, embed] of [[cache?.links, false], [cache?.embeds, true]] as const) {
		for (const r of list ?? []) refs.push({ start: r.position.start.offset, end: r.position.end.offset, line: r.position.start.line, original: r.original, link: r.link, embed });
	}
	return refs;
}

/**
 * Converts the links in the forks of `follows`: all of them (`true`), none (`false`: only counts),
 * or those `write` picks, and then only those are counted. Unless nothing is written, each
 * follow note's "Links to fix" is rewritten from every fork of its source.
 */
export async function convertForks(app: App, host: RemoteHost, follows: readonly Remote[], write: boolean | ((fork: Fork) => boolean)): Promise<LinkTally> {
	const tally = emptyTally();
	const forks = scanForks(app);
	const notes = write === false ? [] : scanFollows(app).follows;
	for (const follow of follows) {
		const source = new SourceLinks(app, host, follow, forks);
		const note = notes.find((f) => f.url === follow.url);
		const report: NoteLinks[] = [];
		for (const fork of source.forks) {
			const file = app.vault.getFileByPath(fork.path);
			if (!file) continue;
			const writes = typeof write === 'function' ? write(fork) : write;
			const c = await source.convertNote(file, fork.meta, writes);
			if (typeof write !== 'function' || writes) addToTally(tally, fork.path, c);
			if (c && note) report.push({ path: fork.path, link: app.fileManager.generateMarkdownLink(file, note.path), left: c.leftLinks });
		}
		if (note && !(await writeReport(app, note.path, renderLinkReport(report)))) {
			new Notice(`Links to fix not updated in ${note.path}: it has more than one "Links to fix" heading.`);
		}
	}
	return tally;
}

/** Puts `section` in place of the follow note's "Links to fix". `false`: the heading is there twice. */
async function writeReport(app: App, path: string, section: string | null): Promise<boolean> {
	const note = app.vault.getFileByPath(path);
	if (!note) return true;
	const text = await app.vault.cachedRead(note);
	const next = withSection(text, LINK_REPORT_HEADING, section);
	if (next === null) return false;
	if (next !== text) await app.vault.process(note, (t) => withSection(t, LINK_REPORT_HEADING, section) ?? t);
	return true;
}

/** The "Convert links in this fork" command. */
export async function convertActiveFork(app: App, data: PublicTxtData): Promise<void> {
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
		new Notice(tallyText(await convertForks(app, vaultHost(app, data), [follow], (f) => f.path === file.path), false));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** The "Convert links in every fork" command. */
export async function convertAllForks(app: App, data: PublicTxtData): Promise<void> {
	try {
		new Notice(tallyText(await convertForks(app, vaultHost(app, data), scanFollows(app).follows, true), true));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** How long to wait for Obsidian to read a note just written before giving up on the offer. */
const CACHE_WAIT_MS = 2000;

/**
 * After forking from `remote` (or overwriting a fork), offers to convert the links in its forks
 * when any can be: the notes `written` may be what other forks link to, or link to them. Waits
 * for Obsidian to have read the written notes; if it hasn't in time, there is no offer and the
 * commands remain. Never throws: the fork stands whatever happens here.
 */
export async function offerConvert(app: App, host: RemoteHost, remote: Remote, written: readonly TFile[]): Promise<void> {
	try {
		for (const file of written) {
			if (!(await whenCached(app, file, CACHE_WAIT_MS))) return;
		}
		const count = await convertForks(app, host, [remote], false);
		if (count.converted === 0) return;
		const n = count.converted;
		const message = createFragment();
		message.createDiv({ text: `${n} ${n === 1 ? 'link' : 'links'} in your forks of ${remote.name} can be converted.` });
		const button = message.createEl('button', { text: 'Convert', cls: 'mod-cta' });
		const notice = new Notice(message, 0);
		button.addEventListener('click', (e) => {
			e.stopPropagation();
			notice.hide();
			void (async () => {
				try {
					new Notice(tallyText(await convertForks(app, host, [remote], true), true));
				} catch (err) {
					new Notice(errorText(err));
				}
			})();
		});
	} catch (e) {
		console.warn('PublicTxt Remotes: counting links to convert:', e);
	}
}

/**
 * Whether Obsidian's cache of `file` matches its text, waiting up to `ms` for it to: the note
 * reads as a fork, and every cached link is where the cache says it is. A note just forked is
 * written twice (text, then front matter), and each write moves the links.
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
	if (!cache || !readForkMeta(cache.frontmatter)) return false;
	const text = await app.vault.cachedRead(file);
	return refsOf(cache).every((r) => text.slice(r.start, r.end) === r.original);
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
