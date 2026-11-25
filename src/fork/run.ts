// Forking source files into the vault (docs/features/fork.md): the Obsidian side of fork.ts.

import { App, normalizePath, Notice, TFile } from 'obsidian';
import { copiesOf, isCopyable, isFrom, type CopySource } from '../copy/copy.ts';
import { splitLink } from '../copy/link-text.ts';
import { noteParts, writeWithProvenance } from '../copy/run.ts';
import type PublicTxtPlugin from '../main.ts';
import { forkedMeta } from '../mirror/mirror.ts';
import { scanForks, scanMirrors } from '../sources/forks.ts';
import type { RemoteHost, Tree } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readMirrorMeta, writeForkMeta, type ForkMeta, type Mirror } from '../sources/fork-meta.ts';
import { ForkModal } from '../ui/fork-modal.ts';
import { ensureFolder } from '../util/vault.ts';
import { initialDestination, type PlannedFork, type VaultLook } from './destination.ts';
import { newForkMeta } from './fork.ts';
import { nameOf } from './links.ts';
import { linkNew, type LinkWork } from './links-run.ts';

/**
 * Forks `paths` from a source: asks where they go (`ForkModal`), then writes them. A file the
 * vault mirrors isn't fetched: its mirror moves there and becomes the fork. One file ends with
 * its note open, and a failure shows in the modal. Several are each tried, and one notice says
 * how it went. `done` runs once anything may have been written; not when the user cancels.
 */
export async function startFork(plugin: PublicTxtPlugin, from: CopySource, paths: readonly string[], done?: () => void): Promise<void> {
	const { app, data } = plugin;
	try {
		const host = vaultHost(app, data);
		const mirrors = new Map<string, Mirror>();
		for (const m of scanMirrors(app)) {
			if (isFrom(m.meta, from) && !mirrors.has(m.meta.path)) mirrors.set(m.meta.path, m);
		}
		const fresh = paths.filter((p) => !mirrors.has(p));
		let files: Tree['files'] = new Map();
		if (fresh.length) {
			if (!from.head) throw new Error(`${fresh[0]} is not mirrored: check ${from.name} first.`);
			({ files } = await host.tree(from.url, from.head.tree));
		}
		const [only] = paths;
		if (paths.length === 1 && only !== undefined && !mirrors.has(only)) {
			if (!isCopyable(only)) throw new Error(`Only Markdown files can be forked: ${only}.`);
			if (!files.has(only)) throw new Error(`${only} is not in ${from.head?.branch ?? from.name} any more.`);
		}

		// A mirror may be forked where it is: its own path isn't in its way.
		const moving = new Set(paths.map((p) => mirrors.get(p)?.path).filter((p): p is string => p !== undefined));
		const look = lookAt(app);
		const vault: VaultLook = { ...look, taken: (p) => look.taken(p) && !moving.has(normalizePath(p)) };
		const initial = initialDestination(paths, data);
		const forks = scanForks(app);
		const earlier = new Map(paths.map((p) => [p, copiesOf(forks, from, p).map((f) => f.path)]));
		const mirrored = new Map([...mirrors].map(([p, m]) => [p, m.path]));

		const moved: string[] = [];
		const one = async (fork: PlannedFork): Promise<TFile> => {
			const mirror = mirrors.get(fork.path);
			if (!mirror) return forkTo(app, host, from, files, fork);
			const file = await forkMirror(app, mirror, normalizePath(fork.to));
			moved.push(fork.path);
			return file;
		};
		const submit = async (plan: readonly PlannedFork[], work: LinkWork): Promise<string | null> => {
			const [single] = plan;
			let written: TFile[];
			try {
				if (plan.length === 1 && single) written = [await forkOne(app, single, mirrored.get(single.path), one)];
				else written = await forkSeveral(host, from, files, plan, one);
			} catch (e) {
				// A mirror may have moved before its keys failed to change: it is where it is now.
				return errorText(e);
			}
			// The mirrors forked are mirrors no more: off the last check's lists.
			plugin.mirrorsNow(from.url, { drop: moved });
			done?.();
			void linkNew(app, written, work);
			return null;
		};
		new ForkModal(app, { from: from.name, paths, initial, earlier, mirrored, vault }, submit).open();
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** Forks one file and opens its note. Throws what went wrong, for the modal to show. */
async function forkOne(app: App, fork: PlannedFork, mirror: string | undefined, one: (fork: PlannedFork) => Promise<TFile>): Promise<TFile> {
	const file = await one(fork);
	new Notice(mirror === undefined || mirror === file.path ? `Forked ${fork.path} to ${file.path}.` : `Forked ${fork.path}: its mirror moved to ${file.path}.`);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/** Forks each file in turn, going on past one that fails; one notice says how it went. Returns the notes written. */
async function forkSeveral(host: RemoteHost, from: CopySource, files: Tree['files'], plan: readonly PlannedFork[], one: (fork: PlannedFork) => Promise<TFile>): Promise<TFile[]> {
	const failed: string[] = [];
	const written: TFile[] = [];
	// One fetch for them all, not one each. A mirrored file has no blob to fetch: it isn't read from the source.
	const blobs = plan.map((f) => files.get(f.path)).filter((b): b is string => b !== undefined);
	if (blobs.length) await host.prefetch?.(from.url, blobs);
	for (const fork of plan) {
		try {
			written.push(await one(fork));
		} catch (e) {
			failed.push(`${fork.path}: ${errorText(e)}`);
		}
	}
	const forked = plan.length - failed.length;
	if (failed.length === 0) new Notice(`Forked ${forked} files from ${from.name}.`);
	// Stays until dismissed: it is the only record of what didn't fork.
	else new Notice([`Forked ${forked} of ${plan.length} files from ${from.name}. Not forked:`, ...failed].join('\n'), 0);
	return written;
}

/** Fetches the file at the source's head and writes it to its planned vault path as a fork. */
async function forkTo(app: App, host: RemoteHost, from: CopySource, files: Tree['files'], fork: PlannedFork): Promise<TFile> {
	const blob = files.get(fork.path);
	if (!from.head || !blob) throw new Error(`Not in ${from.head?.branch ?? from.name} any more.`);
	const text = await host.blob(from.url, blob);
	return writeFork(app, normalizePath(fork.to), text, newForkMeta(from, fork.path, from.head, blob, new Date()));
}

/**
 * Makes the mirror the user's fork: moves its note to `to` (Obsidian updates the links to it,
 * mirrors' aside) and renames its `mirror_*` keys to `fork_*`. Its text stays as it is: the version it mirrors, and
 * anything edited in it. Moved, never copied: two notes of one name would split every link by name.
 */
async function forkMirror(app: App, mirror: Mirror, to: string): Promise<TFile> {
	const file = app.vault.getFileByPath(mirror.path);
	if (!file) throw new Error(`${mirror.path} is gone.`);
	// From the file, not the metadata cache, which may lag.
	const meta = readMirrorMeta(noteParts(await app.vault.read(file)).front);
	if (!meta || meta.path !== mirror.meta.path) throw new Error(`${mirror.path} is no longer a mirror of ${mirror.meta.path}.`);
	if (to !== file.path) {
		if (app.vault.getAbstractFileByPath(to)) throw new Error(`${to} already exists.`);
		const slash = to.lastIndexOf('/');
		if (slash > 0) await ensureFolder(app, to.slice(0, slash));
		await moveMirror(app, file, to);
	}
	await app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
		writeForkMeta(front, forkedMeta(meta, new Date()));
	});
	return file;
}

/**
 * Moves a mirror's note to `to`. Obsidian updates the links to it, even those by name, which go
 * to it still: in the vault's link format, so `[[b]]` can become `[[../../x/b]]`. The user's notes
 * keep that. Mirrors, and this note, get their text back: their links stay as upstream wrote them.
 */
async function moveMirror(app: App, file: TFile, to: string): Promise<void> {
	const names = [nameOf(file.path), nameOf(to)];
	const before: [TFile, string][] = [[file, await app.vault.read(file)]];
	for (const m of scanMirrors(app)) {
		const mirror = app.vault.getFileByPath(m.path);
		if (!mirror || mirror === file) continue;
		const cache = app.metadataCache.getFileCache(mirror);
		const links = [...(cache?.links ?? []), ...(cache?.embeds ?? []), ...(cache?.frontmatterLinks ?? [])];
		if (links.some((l) => names.includes(nameOf(splitLink(l.link).path)))) before.push([mirror, await app.vault.read(mirror)]);
	}
	try {
		// Done once the links are updated, or the user says not to.
		await app.fileManager.renameFile(file, to);
	} finally {
		for (const [note, text] of before) {
			if ((await app.vault.read(note)) !== text) await app.vault.modify(note, text);
		}
	}
}

/** The vault as the fork modal needs to see it. */
function lookAt(app: App): VaultLook {
	return {
		taken: (path) => app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
		folderExists: (folder) => app.vault.getFolderByPath(normalizePath(folder)) !== null,
		isFile: (path) => app.vault.getFileByPath(normalizePath(path)) !== null,
	};
}

/** Creates the note at `path` with `text` and the fork's provenance keys added. Never overwrites. */
export async function writeFork(app: App, path: string, text: string, meta: ForkMeta): Promise<TFile> {
	return writeWithProvenance(app, path, text, (front) => writeForkMeta(front, meta));
}
