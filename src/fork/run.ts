// Forking source files into the vault (docs/features/fork.md): the Obsidian side of fork.ts.

import { App, normalizePath, Notice, TFile } from 'obsidian';
import { attachmentsText, noAttachments, troubled, type AttachmentsCopied } from '../copy/attachments.ts';
import { copiesOf, firstByPath, inPathOrder, isCopyable, type CopySource } from '../copy/copy.ts';
import { splitLink } from '../copy/link-text.ts';
import { noteParts, writeWithProvenance } from '../copy/run.ts';
import type PublicTxtPlugin from '../main.ts';
import { forkedMeta, mirrorFolderOf } from '../mirror/mirror.ts';
import { scanForks, scanMirrors } from '../sources/forks.ts';
import type { RemoteHost, Tree } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readMirrorMeta, writeForkMeta, type ForkMeta, type Mirror } from '../sources/fork-meta.ts';
import { ForkModal } from '../ui/fork-modal.ts';
import { ensureFolder } from '../util/vault.ts';
import { copyForkAttachments, type ForkedNote } from './attachments-run.ts';
import { initialDestination, type PlannedFork, type VaultLook } from './destination.ts';
import { newForkMeta } from './fork.ts';
import { nameOf } from '../links/links.ts';
import { linkNew, type LinkWork } from '../links/run.ts';

/**
 * Forks `paths` from a source: asks where they go (`ForkModal`), then writes them, with the
 * attachments beside each upstream. A file the vault mirrors isn't fetched: its mirror moves
 * there and becomes the fork. One file ends with its note open, and a failure shows in the modal.
 * Several are each tried, and one notice says how it went. `done` runs once anything may have been written; not when the user cancels.
 * `chosen`: the mirror to fork, for a file mirrored more than once; else the first by path.
 */
export async function startFork(plugin: PublicTxtPlugin, from: CopySource, paths: readonly string[], { done, chosen }: { done?: () => void; chosen?: Mirror } = {}): Promise<void> {
	const { app, data } = plugin;
	try {
		const host = vaultHost(app, data);
		const mirrors = firstByPath(inPathOrder(scanMirrors(app)), from);
		if (chosen) mirrors.set(chosen.meta.path, chosen);
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
		const forked: ForkedNote[] = [];
		const one = async (fork: PlannedFork): Promise<TFile> => {
			const mirror = mirrors.get(fork.path);
			const { file, text } = mirror ? await forkMirror(app, mirror, normalizePath(fork.to)) : await forkTo(app, host, from, files, fork);
			if (mirror) moved.push(fork.path);
			forked.push({ path: fork.path, text, to: file.path, mirrored: mirror !== undefined });
			return file;
		};
		const submit = async (plan: readonly PlannedFork[], work: LinkWork): Promise<string | null> => {
			const [single] = plan;
			let written: TFile[];
			let told: { text: string; sticky: boolean };
			try {
				if (plan.length === 1 && single) {
					const file = await one(single);
					const mirror = mirrored.get(single.path);
					written = [file];
					told = { text: mirror === undefined || mirror === file.path ? `Forked ${single.path} to ${file.path}.` : `Forked ${single.path}: its mirror moved to ${file.path}.`, sticky: false };
				} else ({ written, told } = await forkSeveral(host, from, files, plan, one));
			} catch (e) {
				// A mirror may have moved before its keys failed to change: it is where it is now.
				return errorText(e);
			}
			// The mirrors forked are mirrors no more: off the last check's lists.
			plugin.mirrorsNow(from.url, { drop: moved });
			done?.();
			const att = await forkAttachments(app, host, from, files, mirrorFolderOf(data.communityFolder, from.folder, from.name), forked);
			new Notice([told.text, ...attachmentsText(att)].join('\n'), told.sticky || troubled(att) ? 0 : undefined);
			// Opened once its attachments are there, so they show.
			if (plan.length === 1 && written[0]) await app.workspace.getLeaf(false).openFile(written[0]);
			void linkNew(app, written, work);
			return null;
		};
		new ForkModal(app, { from: from.name, paths, initial, earlier, mirrored, vault }, submit).open();
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** Copies the forks' attachments; a failure to is one of them. */
async function forkAttachments(app: App, host: RemoteHost, from: CopySource, files: Tree['files'], mirrorFolder: string, forked: readonly ForkedNote[]): Promise<AttachmentsCopied> {
	try {
		return await copyForkAttachments(app, host, from.url, files, mirrorFolder, forked);
	} catch (e) {
		return { ...noAttachments(), failed: [errorText(e)] };
	}
}

/** Forks each file in turn, going on past one that fails. Returns the notes written, and how it went. */
async function forkSeveral(host: RemoteHost, from: CopySource, files: Tree['files'], plan: readonly PlannedFork[], one: (fork: PlannedFork) => Promise<TFile>): Promise<{ written: TFile[]; told: { text: string; sticky: boolean } }> {
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
	if (failed.length === 0) return { written, told: { text: `Forked ${forked} files from ${from.name}.`, sticky: false } };
	// Stays until dismissed: it is the only record of what didn't fork.
	return { written, told: { text: [`Forked ${forked} of ${plan.length} files from ${from.name}. Not forked:`, ...failed].join('\n'), sticky: true } };
}

/** Fetches the file at the source's head and writes it to its planned vault path as a fork. Gives the note and upstream's text. */
async function forkTo(app: App, host: RemoteHost, from: CopySource, files: Tree['files'], fork: PlannedFork): Promise<{ file: TFile; text: string }> {
	const blob = files.get(fork.path);
	if (!from.head || !blob) throw new Error(`Not in ${from.head?.branch ?? from.name} any more.`);
	const text = await host.blob(from.url, blob);
	return { file: await writeFork(app, normalizePath(fork.to), text, newForkMeta(from, fork.path, from.head, blob, new Date())), text };
}

/**
 * Makes the mirror the user's fork: moves its note to `to` (Obsidian updates the links to it,
 * mirrors' aside) and renames its `mirror_*` keys to `fork_*`. Its text stays as it is: the version it mirrors, and
 * anything edited in it. Moved, never copied: two notes of one name would split every link by name.
 */
async function forkMirror(app: App, mirror: Mirror, to: string): Promise<{ file: TFile; text: string }> {
	const file = app.vault.getFileByPath(mirror.path);
	if (!file) throw new Error(`${mirror.path} is gone.`);
	// From the file, not the metadata cache, which may lag.
	const text = await app.vault.read(file);
	const meta = readMirrorMeta(noteParts(text).front);
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
	return { file, text };
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
