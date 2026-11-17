// Converting the links in forks and mirrors (docs/features/convert-links.md): the Obsidian side
// of links.ts. A link is read as upstream reads it. A fork's is pointed at the vault's copy of
// its file, a fork or a mirror; a mirror's by full path into its mirror folder.

import { App, getFrontMatterInfo, Notice, parseYaml, TFile, type CachedMetadata, type EventRef } from 'obsidian';
import { latestFirst } from '../check/check.ts';
import type { RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readForkMeta, readMirrorMeta, type Copy, type MirrorMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import { scanCopies } from '../sources/forks.ts';
import { isRecord } from '../util/validate.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { forksOf, isForkOf, type Remote } from './fork.ts';
import { writeSections } from './fork-lists.ts';
import { LINK_CHECK_HEADING, LINK_REPORT_HEADING, renderCheckReport, renderLinkReport, type NoteLinks } from './link-report.ts';
import { addToTally, convertLinks, danglingLink, emptyTally, linkShows, mirrorLink, mirrorRoot, missingLink, nothingConverted, splitLink, tallyText, upstreamFiles, upstreamTarget, type Converted, type LinkPlan, type LinkRef, type LinkStyle, type LinkTally, type UpstreamFiles } from './links.ts';

/** One source's copies (forks and mirrors), and its files at each commit they were taken at, read once. */
class SourceLinks {
	readonly copies: Copy[];
	private readonly byPath: Map<string, Copy>;
	private readonly files = new Map<string, Promise<UpstreamFiles>>();
	private style: LinkStyle | null = null;

	private readonly app: App;
	private readonly host: RemoteHost;
	readonly follow: Remote;

	constructor(app: App, host: RemoteHost, follow: Remote, all: readonly Copy[]) {
		this.app = app;
		this.host = host;
		this.follow = follow;
		this.copies = all.filter((c) => isForkOf(c.meta, follow));
		this.byPath = new Map(this.copies.map((c) => [c.path, c]));
	}

	/**
	 * The source's files at `commit`, from its clone (no fetch: the clone holds every tree). When
	 * that can't be read (no commit, no clone, gone from history), the paths of its copies stand in.
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
		return upstreamFiles(this.copies.map((c) => c.meta.path));
	}

	/** Converts the links in the copy `file`; with `write` false only counts them. `null`: the cache was stale. */
	async convertNote(file: TFile, copy: Copy, write: boolean): Promise<Converted | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const refs = refsOf(cache);
		if (refs.length === 0) return nothingConverted('');
		const files = await this.filesAt(copy.meta.commit);
		return rewriteLinks(this.app, file, refs, (ref) => this.planLink(ref, file, copy, files), write);
	}

	/**
	 * A link's new text, why it is left, or `null` when it isn't a link to a file or is right as it
	 * is. A mirror's links point by full path into its own mirror folder (`mirrorLink`), whatever
	 * is in the vault; one moved by hand out of its folder is left as it is.
	 */
	private planLink(ref: LinkRef, file: TFile, { meta, kind }: Copy, files: UpstreamFiles): LinkPlan {
		if (kind === 'mirror') {
			const root = mirrorRoot(file.path, meta.path);
			return root === null ? null : mirrorLink(ref, meta.path, root, files);
		}
		const upstream = upstreamTarget(ref, meta.path, files);
		if (upstream === null) return null;
		const { path, subpath } = splitLink(ref.link);
		const several = 'none' in upstream && upstream.none === 'several';
		// Already a link to a copy from this source: that copy is the target (a second run changes nothing).
		const local = this.app.metadataCache.getFirstLinkpathDest(path, file.path);
		const localCopy = local ? this.byPath.get(local.path) : undefined;
		if (local && localCopy) {
			const then = this.linkTo(local, file.path, subpath, ref.original);
			// Upstream reads it as several files, or as another one: kept on the copy, to check.
			if (several) return { check: 'several', then };
			if ('path' in upstream && upstream.path !== localCopy.meta.path) return { check: 'kept', then };
			return then;
		}
		// No one file upstream (none, or several of that name): a link by its own name, the wiki way.
		if ('none' in upstream) {
			const then = missingLink(ref, this.styleFor(file));
			return several ? { check: 'several', then } : then;
		}
		const target = upstream.path === meta.path ? file : this.copyOf(upstream.path);
		// No copy: a link by name, which converts to the copy once it is forked or mirrored.
		if (!target) return danglingLink(ref, upstream.path, meta.path, files, this.styleFor(file));
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

	/** The vault file of the latest copy, fork or mirror, of the upstream file `path`. */
	private copyOf(path: string): TFile | null {
		const [latest] = latestFirst(forksOf(this.copies, this.follow, path));
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

/** Rewrites `file`'s links from their plans; with `write` false only counts them. `null`: the cache was stale. */
async function rewriteLinks(app: App, file: TFile, refs: readonly LinkRef[], plan: (ref: LinkRef) => LinkPlan, write: boolean): Promise<Converted | null> {
	const counted = convertLinks(await app.vault.cachedRead(file), refs, plan);
	if (!write || !counted || counted.converted === 0) return counted;
	// `process` reads the file itself: the offsets are checked again against what it reads.
	let result: Converted | null = null;
	await app.vault.process(file, (text) => {
		result = convertLinks(text, refs, plan);
		return result?.text ?? text;
	});
	return result;
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
 * Converts the links in the copies (forks and mirrors) of `follows`: all of them (`true`), none
 * (`false`: only counts), or those `write` picks, and then only those are counted. Unless nothing
 * is written, each follow note's "Links to fix" is rewritten from every copy of its source.
 */
export async function convertCopies(app: App, host: RemoteHost, follows: readonly Remote[], write: boolean | ((copy: Copy) => boolean)): Promise<LinkTally> {
	const tally = emptyTally();
	const copies = scanCopies(app);
	const notes = write === false ? [] : scanFollows(app).follows;
	for (const follow of follows) {
		const source = new SourceLinks(app, host, follow, copies);
		const note = notes.find((f) => f.url === follow.url);
		const report: NoteLinks[] = [];
		for (const copy of source.copies) {
			const file = app.vault.getFileByPath(copy.path);
			if (!file) continue;
			const writes = typeof write === 'function' ? write(copy) : write;
			const c = await source.convertNote(file, copy, writes);
			if (typeof write !== 'function' || writes) addToTally(tally, copy.path, c);
			if (c && note) report.push({ path: copy.path, link: app.fileManager.generateMarkdownLink(file, note.path), left: c.leftLinks, check: c.checkLinks });
		}
		const file = note ? app.vault.getFileByPath(note.path) : null;
		if (!file) continue;
		const { skipped } = await writeSections(app, file, [[LINK_REPORT_HEADING, renderLinkReport(report)], [LINK_CHECK_HEADING, renderCheckReport(report)]]);
		for (const heading of skipped) {
			const name = heading.slice(3);
			new Notice(`${name} not updated in ${file.path}: it has more than one "${name}" heading.`);
		}
	}
	return tally;
}

/** The provenance of a fork or a mirror, whichever `fm` holds. */
function readCopyMeta(fm: Record<string, unknown> | undefined): MirrorMeta | null {
	return readForkMeta(fm) ?? readMirrorMeta(fm);
}

/** The "Convert links in this note" command: the active fork or mirror. */
export async function convertActiveCopy(app: App, data: PublicTxtData): Promise<void> {
	const file = app.workspace.getActiveFile();
	const meta = file ? readCopyMeta(app.metadataCache.getFileCache(file)?.frontmatter) : null;
	if (!file || !meta) {
		new Notice('This note is not a fork or a mirror.');
		return;
	}
	const follow = scanFollows(app).follows.find((f) => isForkOf(meta, f));
	if (!follow) {
		new Notice('The source this note came from is not followed.');
		return;
	}
	try {
		new Notice(tallyText(await convertCopies(app, vaultHost(app, data), [follow], (c) => c.path === file.path), false));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** The "Convert links in every fork and mirror" command. */
export async function convertAllCopies(app: App, data: PublicTxtData): Promise<void> {
	try {
		new Notice(tallyText(await convertCopies(app, vaultHost(app, data), scanFollows(app).follows, true), true));
	} catch (e) {
		new Notice(errorText(e));
	}
}

/**
 * After mirroring or updating mirrors: points the links in the mirrors `written` into their
 * mirror folder (`mirrorLink`), unasked, since a mirror is upstream's and has no edits to
 * respect. `files` are the source's files at the commit they were written from. Only those
 * notes: a mirror's links don't depend on anything else in the vault, and mirrors are never in
 * the report. Waits for Obsidian to have read them; if it hasn't in time, nothing is converted
 * and the commands remain. Never throws: the mirror stands whatever happens here.
 */
export async function convertMirrors(app: App, files: UpstreamFiles, written: readonly TFile[]): Promise<void> {
	try {
		if (!(await allCached(app, written))) return;
		const stale: string[] = [];
		for (const file of written) {
			const cache = app.metadataCache.getFileCache(file);
			const meta = readMirrorMeta(cache?.frontmatter);
			const root = meta ? mirrorRoot(file.path, meta.path) : null;
			if (!meta || root === null) continue;
			const c = await rewriteLinks(app, file, refsOf(cache), (ref) => mirrorLink(ref, meta.path, root, files), true);
			if (!c) stale.push(file.path);
		}
		if (stale.length) new Notice(`Changed while converting links, try again: ${stale.join(', ')}.`);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** How long to wait for Obsidian to read a note just written before giving up on the offer. */
const CACHE_WAIT_MS = 2000;

/**
 * After forking from `remote` (or overwriting a fork), offers to convert the links in its forks
 * when any can be: the notes `written` may be what other copies link to, or link to them. Waits
 * for Obsidian to have read the written notes; if it hasn't in time, there is no offer and the
 * commands remain. Never throws: the fork stands whatever happens here.
 */
export async function offerConvert(app: App, host: RemoteHost, remote: Remote, written: readonly TFile[]): Promise<void> {
	try {
		if (!(await allCached(app, written))) return;
		const count = await convertCopies(app, host, [remote], false);
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
					new Notice(tallyText(await convertCopies(app, host, [remote], true), true));
				} catch (err) {
					new Notice(errorText(err));
				}
			})();
		});
	} catch (e) {
		console.warn('PublicTxt Remotes: counting links to convert:', e);
	}
}

/** Whether Obsidian has read every note in `written`, waiting up to `CACHE_WAIT_MS` for each. */
async function allCached(app: App, written: readonly TFile[]): Promise<boolean> {
	for (const file of written) {
		if (!(await whenCached(app, file, CACHE_WAIT_MS))) return false;
	}
	return true;
}

/**
 * Whether Obsidian's cache of `file` matches its text, waiting up to `ms` for it to: the note
 * reads as a fork or a mirror of the blob its text says, and every cached link is where the
 * cache says it is. A note just forked or mirrored is written twice (text, then front matter),
 * and each write moves the links. The blob tells an overwritten note from its old cache, which
 * a note with no links would otherwise match.
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
	const cached = readCopyMeta(cache?.frontmatter);
	if (!cache || !cached) return false;
	const text = await app.vault.cachedRead(file);
	if (readCopyMeta(frontMatterOf(text))?.blob !== cached.blob) return false;
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
